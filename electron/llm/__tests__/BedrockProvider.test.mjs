import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
const { listBedrockModels, streamBedrock, validateBedrockModel, validateBedrockConnection, describeBedrockError } =
    require('../../../dist-electron/electron/llm/BedrockProvider');
const connection = { region: 'us-east-1', auth: 'bearer', apiKey: 'test-key' };
const collect = async stream => Array.fromAsync(stream);
const json = value => Buffer.from(JSON.stringify(value));

function frame(event, payload) {
    const header = (key, value) => Buffer.concat([Buffer.from([key.length]), Buffer.from(key),
        Buffer.from([7, 0, value.length]), Buffer.from(value)]);
    const headers = Buffer.concat([header(':message-type', 'event'), header(':event-type', event),
        header(':content-type', 'application/json')]);
    const content = json(payload);
    const buffer = Buffer.alloc(16 + headers.length + content.length);
    buffer.writeUInt32BE(buffer.length);
    buffer.writeUInt32BE(headers.length, 4);
    buffer.writeUInt32BE(crc32(buffer.subarray(0, 8)), 8);
    headers.copy(buffer, 12);
    content.copy(buffer, 12 + headers.length);
    buffer.writeUInt32BE(crc32(buffer.subarray(0, -4)), buffer.length - 4);
    return buffer;
}

function handler(assertRequest, response, contentType = 'application/json') {
    return {
        async handle(request) {
            assert.equal(request.hostname, 'bedrock-runtime.us-east-1.amazonaws.com');
            assert.equal(new Headers(request.headers).get('authorization'), 'Bearer test-key');
            assertRequest(request, JSON.parse(Buffer.from(request.body).toString('utf8')));
            return { response: { statusCode: 200, headers: { 'content-type': contentType },
                body: Readable.from(Array.isArray(response) ? response : [json(response)]) } };
        },
        destroy() {},
    };
}

test('ConverseStream sends image bytes and model reasoning options, yielding answer deltas only', async () => {
    const model = 'us.amazon.nova-2-lite-v1:0';
    const reasoningConfig = { type: 'enabled', maxReasoningEffort: 'high' };
    const reply = [
        frame('contentBlockDelta', { contentBlockIndex: 0, delta: { reasoningContent: { text: 'private' } } }),
        frame('contentBlockDelta', { contentBlockIndex: 1, delta: { text: 'First ' } }),
        frame('contentBlockDelta', { contentBlockIndex: 1, delta: { text: 'second' } }),
        frame('messageStop', { stopReason: 'end_turn' }),
    ];
    const wire = handler((request, body) => {
        assert.match(decodeURIComponent(request.path), /us\.amazon\.nova-2-lite-v1:0\/converse-stream$/);
        assert.deepEqual(body.additionalModelRequestFields, { reasoningConfig });
        assert.deepEqual(body.system, [{ text: 'instructions' }]);
        assert.equal(body.messages[0].content[1].image.source.bytes, 'AQID');
        assert.equal(body.inferenceConfig, undefined);
    }, reply, 'application/vnd.amazon.eventstream');
    assert.deepEqual(await collect(streamBedrock(connection, model, { api: 'converse', parameters: { reasoningConfig } },
        { text: 'Read the image', system: 'instructions', images: [{ mimeType: 'image/png', data: 'AQID' }] }, undefined, wire)),
    ['First ', 'second']);
});

test('Converse uses a buffered call for a non-streaming model', async () => {
    const wire = handler((request, body) => {
        assert.match(request.path, /\/converse$/);
        assert.deepEqual(body.inferenceConfig, { maxTokens: 50 });
        assert.deepEqual(body.messages[0].content, [{ text: 'instructions\n\nQuestion' }]);
    }, { output: { message: { role: 'assistant', content: [{ text: 'Buffered answer' }] } }, stopReason: 'end_turn' });
    assert.deepEqual(await collect(streamBedrock(connection, 'meta.example', {
        api: 'converse', maxTokens: 50, streaming: false, systemInUserMessage: true,
    }, { text: 'Question', system: 'instructions' }, undefined, wire)), ['Buffered answer']);
});

test('Native Invoke uses a model-defined request and output schema', async () => {
    const wire = handler((request, body) => {
        assert.match(request.path, /\/invoke$/);
        assert.deepEqual(body, { prompt: 'role: instructions\nquestion: "Hello"', images: ['AQID'], max_tokens: 23 });
    }, { results: [{ outputText: 'Native answer' }] });
    assert.deepEqual(await collect(streamBedrock(connection, 'vendor.example', {
        api: 'invoke', streaming: false, nativeInput: { prompt: 'role: ${system}\nquestion: ${prompt}', images: '$images' },
        nativeTextPath: 'results.0.outputText', parameters: { max_tokens: 23 },
    }, { text: '"Hello"', system: 'instructions', images: [{ mimeType: 'image/png', data: 'AQID' }] }, undefined, wire)), ['Native answer']);
});

test('SigV4 Runtime Chat Completions uses the AWS SDK credential chain and correct HTTPS route', async t => {
    const previous = {};
    const env = { AWS_ACCESS_KEY_ID: 'TESTAWSKEY', AWS_SECRET_ACCESS_KEY: 'test-secret', AWS_SESSION_TOKEN: 'test-session', AWS_PROFILE: undefined };
    Object.entries(env).forEach(([key, value]) => {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
    t.after(() => Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }));
    const calls = t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(String(url), 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions');
        assert.match(init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=TESTAWSKEY\/\d+\/us-east-1\/bedrock\/aws4_request/);
        assert.equal(init.headers['x-amz-security-token'], 'test-session');
        assert.equal(JSON.parse(init.body).reasoning_effort, 'high');
        return Response.json({ choices: [{ message: { content: 'Signed answer' } }] });
    });
    assert.deepEqual(await collect(streamBedrock({ region: 'us-east-1', auth: 'aws' }, 'openai.gpt-oss-120b-1:0', {
        api: 'runtime-chat', streaming: false, parameters: { reasoning_effort: 'high' },
    }, { text: 'Question' })), ['Signed answer']);
    assert.equal(calls.mock.callCount(), 1);
});

test('Credential and model validation keeps Sonic and unexpected hostnames out of text inference', () => {
    assert.throws(() => validateBedrockConnection({ region: 'us-east-1.example.com', auth: 'aws' }), /Region/);
    assert.throws(() => validateBedrockModel('us.amazon.nova-2-5-sonic'), /text or multimodal/);
    assert.doesNotThrow(() => validateBedrockModel('arn:aws:bedrock:us-east-1:123456789000:application-inference-profile/example'));
    const error = Object.assign(new Error('SENSITIVE'), { name: 'AccessDeniedException' });
    assert.match(describeBedrockError(error).message, /IAM permissions/);
    assert.doesNotMatch(describeBedrockError(error).message, /SENSITIVE/);
});

test('Bedrock model IDs retain their provider even when they contain another vendor name', () => {
    const { LLMHelper } = require('../../../dist-electron/electron/LLMHelper');
    const helper = Object.create(LLMHelper.prototype);
    for (const model of ['bedrock/openai.gpt-oss-120b-1:0', 'bedrock/us.anthropic.claude-sonnet-5']) {
        assert.deepEqual(helper.classifyCloudModel(model), { provider: 'bedrock', model });
        assert.equal(helper.isOpenAiModel(model), false);
    }
});

test('Catalogue combines regional foundation models, paginated inference profiles and Mantle', async t => {
    const mantle = t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(String(url), 'https://bedrock-mantle.us-east-1.api.aws/v1/models');
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-key');
        return Response.json({ object: 'list', data: [{ id: 'anthropic.claude-test' }] });
    });
    const calls = [];
    const aws = {
        async handle(request) {
            assert.equal(request.hostname, 'bedrock.us-east-1.amazonaws.com');
            assert.equal(new Headers(request.headers).get('authorization'), 'Bearer test-key');
            calls.push(request.path);
            let payload;
            if (request.path === '/foundation-models') {
                assert.equal(request.query.byOutputModality, 'TEXT');
                payload = { modelSummaries: [
                    { modelId: 'meta.vision', modelName: 'Meta Vision', inputModalities: ['TEXT', 'IMAGE'], outputModalities: ['TEXT'],
                        responseStreamingSupported: false, inferenceTypesSupported: ['ON_DEMAND'] },
                    { modelId: 'amazon.nova-2-5-sonic', outputModalities: ['TEXT'], inferenceTypesSupported: ['ON_DEMAND'] },
                ] };
            } else {
                assert.equal(request.path, '/inference-profiles');
                payload = request.query.nextToken ? { inferenceProfileSummaries: [
                    { inferenceProfileId: 'global.other', status: 'ACTIVE', models: [] },
                ] } : { nextToken: 'next', inferenceProfileSummaries: [
                    { inferenceProfileId: 'us.meta.vision', status: 'ACTIVE', models: [{ modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/meta.vision' }] },
                    { inferenceProfileId: 'us.retired', status: 'INACTIVE', models: [] },
                ] };
            }
            return { response: { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Readable.from([json(payload)]) } };
        },
        destroy() {},
    };
    const result = await listBedrockModels(connection, new AbortController().signal, aws);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.models.map(model => model.id).sort(), ['global.other', 'mantle:anthropic.claude-test', 'meta.vision', 'us.meta.vision']);
    const profile = result.models.find(model => model.id === 'us.meta.vision');
    assert.equal(profile.image, true);
    assert.equal(profile.streaming, false);
    assert.equal(calls.filter(path => path === '/inference-profiles').length, 2);
    assert.equal(mantle.mock.callCount(), 1);
});

test('Mantle Claude Messages sends native thinking options and omits thinking from the answer', async t => {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(String(url), 'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages');
        assert.equal(new Headers(init.headers).get('x-api-key'), 'test-key');
        const body = JSON.parse(init.body);
        assert.equal(body.model, 'anthropic.claude-test');
        assert.deepEqual(body.thinking, { type: 'adaptive' });
        return Response.json({ content: [{ type: 'thinking', thinking: 'internal' }, { type: 'text', text: 'Visible' }] });
    });
    assert.deepEqual(await collect(streamBedrock(connection, 'mantle:anthropic.claude-test', {
        api: 'mantle-messages', streaming: false, parameters: { thinking: { type: 'adaptive' } },
    }, { text: 'Question' })), ['Visible']);
});
