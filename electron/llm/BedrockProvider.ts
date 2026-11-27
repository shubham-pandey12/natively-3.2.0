import { BedrockClient, ListFoundationModelsCommand, paginateListInferenceProfiles } from '@aws-sdk/client-bedrock';
import {
    BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand, InvokeModelCommand, InvokeModelWithResponseStreamCommand,
    type BedrockRuntimeClientConfig, type ContentBlock, type ConverseCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { BedrockConnection, BedrockModel, BedrockModelOptions } from '../../src/types/bedrock';
export { defaultBedrockOptions } from '../../src/types/bedrock';

const voiceModel = (id: string) => /(?:^|[/:.])amazon\.nova[^/]*sonic/i.test(id);
const regionPattern = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;

export function validateBedrockConnection(connection: BedrockConnection): void {
    if (!regionPattern.test(connection.region) || !['aws', 'bearer'].includes(connection.auth)) {
        throw new Error('Enter a valid AWS Region and authentication method.');
    }
    if (connection.auth === 'bearer' && !connection.apiKey) throw new Error('Enter a Bedrock API key.');
}

export function validateBedrockModel(model: string): void {
    if (!model || model.length > 2048 || !/^[\w:./+\-]+$/.test(model) || voiceModel(model)) {
        throw new Error('Enter a Bedrock text or multimodal model ID or inference ARN.');
    }
}

export function validateBedrockOptions(options: BedrockModelOptions): void {
    if (!options || !['converse', 'invoke', 'runtime-chat', 'runtime-responses', 'runtime-messages',
        'mantle-chat', 'mantle-responses', 'mantle-messages'].includes(options.api)) {
        throw new Error('Select a Bedrock inference API.');
    }
    for (const value of [options.temperature, options.topP]) {
        if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
            throw new Error('Temperature and top P must be between 0 and 1.');
        }
    }
    if (options.maxTokens !== undefined && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1)) {
        throw new Error('Max tokens must be a positive integer.');
    }
    if ([options.parameters, options.nativeInput].some(value => value !== undefined
        && (!value || typeof value !== 'object' || Array.isArray(value)))) {
        throw new Error('Model parameters and the native request body must be JSON objects.');
    }
    if (options.api === 'invoke' && (!options.nativeInput || typeof options.nativeTextPath !== 'string' || !options.nativeTextPath.trim())) {
        throw new Error('Invoke requires a native request body and a response text path.');
    }
}

function sdkConfig(connection: BedrockConnection) {
    validateBedrockConnection(connection);
    return {
        region: connection.region,
        ignoreConfiguredEndpointUrls: true,
        maxAttempts: 1,
        ...(connection.auth === 'bearer'
            ? { token: { token: connection.apiKey! }, authSchemePreference: ['httpBearerAuth'] }
            : { authSchemePreference: ['sigv4'] }),
    };
}

function restConfig(connection: BedrockConnection, endpoint: 'runtime' | 'mantle') {
    validateBedrockConnection(connection);
    const { region, apiKey } = connection;
    const host = endpoint === 'mantle'
        ? `bedrock-mantle.${region}.api.aws`
        : `bedrock-runtime.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`;
    const client = connection.auth === 'aws' ? new BedrockRuntimeClient(sdkConfig(connection)) : undefined;
    const awsFetch: typeof fetch = async (url, init) => {
        const target = new URL(String(url));
        if (target.origin !== `https://${host}`) throw new Error('Unexpected Bedrock endpoint.');
        if (!client) return fetch(target, { ...init, redirect: 'error' });
        const headers = new Headers(init?.headers);
        headers.delete('authorization');
        headers.delete('x-api-key');
        headers.set('host', host);
        const signer = await client.config.signer();
        const signed = await signer.sign({
            protocol: 'https:', hostname: host, method: init?.method ?? 'GET', path: target.pathname,
            query: Object.fromEntries(target.searchParams), headers: Object.fromEntries(headers), body: init?.body,
        }, { signingRegion: region, signingService: endpoint === 'runtime' ? 'bedrock' : 'bedrock-mantle' });
        return fetch(target, { ...init, headers: signed.headers, redirect: 'error' });
    };
    return { host, apiKey: apiKey ?? 'aws-sigv4', maxRetries: 0, timeout: 120_000, fetch: awsFetch };
}

function openAiClient(connection: BedrockConnection, endpoint: 'runtime' | 'mantle', openAiPath = false) {
    const { host, ...config } = restConfig(connection, endpoint);
    return new OpenAI({ ...config, baseURL: `https://${host}${endpoint === 'runtime' || openAiPath ? '/openai' : ''}/v1` });
}

const KNOWN_AWS_CAUSES: Array<[RegExp, string]> = [
    [/invalid api key format|base64 decoding failed/i, 'The Bedrock API key is malformed. Paste the full key (it starts with ABSK) without quotes or spaces.'],
    [/does not support api keys/i, 'This AWS operation does not accept Bedrock API keys; it needs IAM access keys.'],
    [/(?:api key|bearer token).*(?:expired|invalid)|(?:expired|invalid).*(?:api key|bearer token)|security token.*(?:invalid|expired)/i, 'The API key or AWS credentials are invalid or expired. Create a new one.'],
    [/on-demand throughput.*not supported|inference profile/i, 'This model must be called through an inference profile. Pick the "us." / "eu." / "apac." / "global." profile ID from Discover models instead of the bare model ID.'],
    [/(?:don't|do not) have access to the model|model access/i, 'Your AWS account has not been granted access to this model in this Region. Enable it in the Bedrock console (Model access).'],
    [/model identifier is invalid|model.*not found|could not resolve the foundation model/i, 'This model ID does not exist in the selected Region.'],
    [/end of (?:its )?life|legacy|no longer (?:available|supported)/i, 'This model version is retired. Choose a current model.'],
    [/operation not allowed/i, 'AWS blocked model calls for this AWS account. This is an account-level restriction, not an app or model problem: use an API key from an account that can call Bedrock (try the model in the Bedrock Playground there first), or ask AWS Support to enable Bedrock for this account.'],
    [/not authorized to perform/i,'The IAM identity lacks permission for this Bedrock action.'],
];

/** Maps AWS's error text to a known, safe explanation; raw AWS bodies are never echoed. */
export function awsErrorDetail(message: unknown): string {
    if (typeof message !== 'string') return '';
    return KNOWN_AWS_CAUSES.find(([pattern]) => pattern.test(message))?.[1] ?? '';
}

export function describeBedrockError(error: unknown): Error {
    type AwsError = { name?: string; message?: string; status?: number; $metadata?: { httpStatusCode?: number }; cause?: AwsError };
    const outer = error as AwsError | undefined;
    const aws = outer?.name === 'APIConnectionError' && outer.cause ? outer.cause : outer;
    const status = aws?.status ?? aws?.$metadata?.httpStatusCode;
    const name = aws?.name?.match(/^[a-zA-Z]{1,80}$/)?.[0] ?? 'Error';
    const detail = /credentialsprovider/i.test(name)
        ? 'No AWS credentials were found on this computer. Use a Bedrock API key, or configure AWS CLI credentials (aws configure) or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, then restart Natively.'
        : status === 401 || /expiredtoken|unrecognizedclient/i.test(name)
        ? 'Check your AWS credentials or Bedrock API key (it may be invalid or expired).'
        : status === 403 || /credential|accessdenied/i.test(name)
            ? 'Check IAM permissions (bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream), model access, and AWS Marketplace permissions.'
        : status === 429 || /throttl|quota/i.test(name) ? 'AWS throttled the request or the account reached a quota.'
        : status === 404 || /notfound/i.test(name) ? 'Check the model ID and Region.'
        : status === 400 || /validation/i.test(name) ? 'Check the inference API, model parameters, and whether this model requires an inference profile.'
        : 'Check the AWS Region and connection, then retry.';
    const code = status && name !== 'Error' ? `${status} ${name}` : (status ?? name);
    const awsMessage = awsErrorDetail(aws?.message);
    const result = new Error(`Amazon Bedrock (${code}). ${awsMessage ? `${awsMessage} ` : ''}${detail}`);
    // Raw AWS text (key-redacted) is kept off .message; only the user-initiated connection test shows it.
    const awsRaw = typeof aws?.message === 'string'
        ? aws.message.replace(/\s+/g, ' ').replace(/(?:ABSK|AKIA|ASIA)[A-Za-z0-9+/=]{8,}/g, '[redacted]').slice(0, 400) : undefined;
    return Object.assign(result, { status, provider: 'bedrock', awsRaw });
}

export async function listBedrockModels(connection: BedrockConnection, signal: AbortSignal, requestHandler?: BedrockRuntimeClientConfig['requestHandler']) {
    const client = new BedrockClient({ ...sdkConfig(connection), requestHandler });
    const catalogue = new Map<string, BedrockModel>();
    const warnings: string[] = [];
    try {
        const [foundations, profiles, mantle] = await Promise.allSettled([
            client.send(new ListFoundationModelsCommand({ byOutputModality: 'TEXT' }), { abortSignal: signal }),
            (async () => {
                const models = [];
                for await (const page of paginateListInferenceProfiles({ client, stopOnSameToken: true }, {}, { abortSignal: signal })) {
                    models.push(...(page.inferenceProfileSummaries ?? []));
                }
                return models;
            })(),
            (async () => {
                const models = [];
                for await (const model of openAiClient(connection, 'mantle').models.list({ signal })) models.push(model);
                return models;
            })(),
        ]);
        const foundationById = new Map<string, BedrockModel>();
        if (foundations.status === 'fulfilled') {
            for (const model of foundations.value.modelSummaries ?? []) {
                if (!model.modelId || voiceModel(model.modelId) || !model.outputModalities?.includes('TEXT')) continue;
                const row: BedrockModel = { id: model.modelId, label: model.modelName ?? model.modelId,
                    image: model.inputModalities?.includes('IMAGE'), streaming: model.responseStreamingSupported, source: 'foundation' };
                foundationById.set(row.id, row);
                if (model.inferenceTypesSupported?.includes('ON_DEMAND')) catalogue.set(row.id, row);
            }
        } else warnings.push(`Foundation models: ${describeBedrockError(foundations.reason).message}`);
        if (profiles.status === 'fulfilled') {
            for (const profile of profiles.value) {
                const id = profile.inferenceProfileId;
                if (!id || profile.status !== 'ACTIVE' || profile.models?.some(model => voiceModel(model.modelArn ?? ''))) continue;
                const base = foundationById.get(profile.models?.[0]?.modelArn?.split('/').at(-1) ?? '');
                catalogue.set(id, { id, label: profile.inferenceProfileName ?? id,
                    image: base?.image, streaming: base?.streaming, source: 'profile' });
            }
        } else warnings.push(`Inference profiles: ${describeBedrockError(profiles.reason).message}`);
        if (mantle.status === 'fulfilled') {
            for (const model of mantle.value) {
                if (!voiceModel(model.id)) catalogue.set(`mantle:${model.id}`,
                    { id: `mantle:${model.id}`, label: `${model.id} (Mantle)`, source: 'mantle' });
            }
        } else warnings.push(`Mantle: ${describeBedrockError(mantle.reason).message}`);
        return { models: [...catalogue.values()].sort((a, b) => a.label.localeCompare(b.label)), warnings };
    } finally {
        client.destroy();
    }
}

interface BedrockImage { mimeType: string; data: string }
interface BedrockPrompt { text: string; system?: string; images?: BedrockImage[] }

function textAtPath(value: unknown, path: string): string | undefined {
    for (const key of path.split('.')) {
        value = value && typeof value === 'object' && Object.hasOwn(value, key)
            ? (value as Record<string, unknown>)[key] : undefined;
    }
    return typeof value === 'string' ? value : undefined;
}

function nativeBody(value: unknown, prompt: BedrockPrompt): unknown {
    if (Array.isArray(value)) return value.map(item => nativeBody(item, prompt));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, nativeBody(item, prompt)]));
    }
    if (value === '$images') return prompt.images?.map(image => image.data) ?? [];
    if (typeof value === 'string') {
        return value.replace(/\$\{(prompt|system|image\.\d+)\}/g, (_, field: string) => {
            if (field === 'prompt') return prompt.text;
            if (field === 'system') return prompt.system ?? '';
            return prompt.images?.[Number(field.slice('image.'.length))]?.data ?? '';
        });
    }
    return value;
}

const PROFILE_PREFIX = /^(?:us|eu|apac|jp|au|ca|us-gov|global)\./;
const resolvedModelIds = new Map<string, string>();

/** Geography prefix of cross-region inference profiles for a Region. */
export function bedrockGeoPrefix(region: string): string | undefined {
    if (region.startsWith('us-gov-')) return 'us-gov';
    if (region.startsWith('us-')) return 'us';
    if (region.startsWith('eu-')) return 'eu';
    if (region === 'ap-northeast-1' || region === 'ap-northeast-3') return 'jp';
    if (region.startsWith('ap-southeast-2') || region.startsWith('ap-southeast-4')) return 'au';
    if (region.startsWith('ap-')) return 'apac';
    if (region.startsWith('ca-')) return 'ca';
    return undefined;
}

/**
 * Model IDs to try, in order, so users never have to know whether a model needs an
 * inference profile: the ID as given, then the Region's geography profile, then the
 * global profile, then the bare foundation model ID.
 */
export function bedrockModelCandidates(modelId: string, region: string): string[] {
    if (modelId.startsWith('arn:')) return [modelId];
    const base = modelId.replace(PROFILE_PREFIX, '');
    const geo = bedrockGeoPrefix(region);
    return [...new Set([resolvedModelIds.get(`${region}|${modelId}`), modelId,
        geo ? `${geo}.${base}` : undefined, region.startsWith('ap-') && geo !== 'apac' ? `apac.${base}` : undefined,
        `global.${base}`, base].filter((id): id is string => Boolean(id)))];
}

function retryableWithAnotherId(error: unknown): boolean {
    const failure = error as { name?: string; status?: number; $metadata?: { httpStatusCode?: number } } | undefined;
    const status = failure?.status ?? failure?.$metadata?.httpStatusCode;
    return status === 400 || status === 404 || /validation|notfound/i.test(failure?.name ?? '');
}

export async function* streamBedrock(
    connection: BedrockConnection, selectedModel: string, options: BedrockModelOptions, prompt: BedrockPrompt, signal?: AbortSignal,
    requestHandler?: BedrockRuntimeClientConfig['requestHandler'],
): AsyncGenerator<string> {
    validateBedrockModel(selectedModel);
    validateBedrockOptions(options);
    const mantle = selectedModel.startsWith('mantle:');
    const requested = selectedModel.replace(/^mantle:/, '');
    const candidates = mantle ? [requested] : bedrockModelCandidates(requested, connection.region);
    let modelId = candidates[0];
    const abortSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
    let emitted = false;
    for (let index = 0; index < candidates.length; index++) {
        modelId = candidates[index];
        try {
            for await (const text of readAnswer()) {
                abortSignal.throwIfAborted();
                if (!text) continue;
                emitted = true;
                yield text;
            }
            if (!mantle) resolvedModelIds.set(`${connection.region}|${requested}`, modelId);
            break;
        } catch (error) {
            if (abortSignal.aborted) throw abortSignal.reason;
            if (!emitted && index < candidates.length - 1 && retryableWithAnotherId(error)) {
                console.warn('[Bedrock] Retrying with another model ID', { tried: modelId, next: candidates[index + 1] });
                continue;
            }
            const failure = describeBedrockError(error);
            console.warn('[Bedrock]', failure.message, { errorName: (error as { name?: string })?.name, model: modelId, api: options.api });
            throw failure;
        }
    }
    if (!emitted) throw new Error('Amazon Bedrock returned no answer text. Check the model, output-token limit, and response format.');

    async function* readAnswer(): AsyncGenerator<string> {
        const { api, streaming, temperature, topP, maxTokens, parameters } = options;
        if (api.endsWith('-messages')) {
            const { host, ...config } = restConfig(connection, api === 'runtime-messages' ? 'runtime' : 'mantle');
            const client = new Anthropic({ ...config, baseURL: `https://${host}/anthropic` });
            const request: Anthropic.MessageCreateParamsNonStreaming = {
                max_tokens: maxTokens ?? 2048, temperature, top_p: topP, ...parameters, model: modelId,
                system: prompt.system,
                messages: [{ role: 'user', content: [
                    { type: 'text', text: prompt.text },
                    ...(prompt.images ?? []).map(({ mimeType, data }) => ({ type: 'image' as const,
                        source: { type: 'base64' as const, media_type: mimeType as Anthropic.Base64ImageSource['media_type'], data } })),
                ] }],
            };
            if (streaming === false) {
                const response = await client.messages.create({ ...request, stream: false }, { signal: abortSignal });
                for (const block of response.content) if (block.type === 'text') yield block.text;
            } else {
                for await (const event of await client.messages.create({ ...request, stream: true }, { signal: abortSignal })) {
                    if (event.type === 'content_block_start' && event.content_block.type === 'text') yield event.content_block.text;
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
                }
            }
            return;
        }
        if (api.endsWith('-chat') || api.endsWith('-responses')) {
            const client = openAiClient(connection, api.startsWith('runtime-') ? 'runtime' : 'mantle',
                options.mantleOpenAiPath ?? (/^(?:openai\.gpt-(?!oss)|google\.gemma)/.test(modelId)));
            const images = (prompt.images ?? []).map(({ mimeType, data }) => `data:${mimeType};base64,${data}`);
            const sampling = { temperature, top_p: topP };
            if (api.endsWith('-responses')) {
                const request = { ...sampling, max_output_tokens: maxTokens, ...parameters, store: false, model: modelId,
                    instructions: prompt.system,
                    input: [{ role: 'user' as const, content: [
                        { type: 'input_text' as const, text: prompt.text },
                        ...images.map(image_url => ({ type: 'input_image' as const, image_url, detail: 'auto' as const })),
                    ] }] };
                if (streaming === false) yield (await client.responses.create({ ...request, stream: false }, { signal: abortSignal })).output_text;
                else for await (const event of await client.responses.create({ ...request, stream: true }, { signal: abortSignal })) {
                    if (event.type === 'response.output_text.delta') yield event.delta;
                    if (event.type === 'error' || event.type === 'response.failed') throw new Error('Bedrock Responses stream failed.');
                }
            } else {
                const request = { ...sampling, max_completion_tokens: maxTokens, ...parameters, model: modelId, messages: [
                    ...(prompt.system ? [{ role: 'system' as const, content: prompt.system }] : []),
                    { role: 'user' as const, content: images.length ? [{ type: 'text' as const, text: prompt.text },
                        ...images.map(url => ({ type: 'image_url' as const, image_url: { url } }))] : prompt.text },
                ] };
                if (streaming === false) yield (await client.chat.completions.create({ ...request, stream: false },
                    { signal: abortSignal })).choices[0]?.message?.content ?? '';
                else for await (const event of await client.chat.completions.create({ ...request, stream: true }, { signal: abortSignal })) {
                    yield event.choices[0]?.delta?.content ?? '';
                }
            }
            return;
        }

        const client = new BedrockRuntimeClient({ ...sdkConfig(connection), requestHandler });
        try {
            if (api === 'invoke') {
                const request = { modelId, body: JSON.stringify(nativeBody({ ...options.nativeInput, ...parameters }, prompt)),
                    contentType: 'application/json', accept: 'application/json' };
                if (streaming === false) {
                    const result = await client.send(new InvokeModelCommand(request), { abortSignal });
                    yield textAtPath(JSON.parse(Buffer.from(result.body).toString('utf8')), options.nativeTextPath!) ?? '';
                } else {
                    const result = await client.send(new InvokeModelWithResponseStreamCommand(request), { abortSignal });
                    for await (const event of result.body ?? []) {
                        if (event.chunk?.bytes) {
                            yield textAtPath(JSON.parse(Buffer.from(event.chunk.bytes).toString('utf8')), options.nativeTextPath!) ?? '';
                        } else throw new Error('Bedrock Invoke stream failed.');
                    }
                }
                return;
            }
            const content: ContentBlock[] = [{ text: options.systemInUserMessage && prompt.system
                ? `${prompt.system}\n\n${prompt.text}` : prompt.text }];
            for (const { mimeType, data } of prompt.images ?? []) {
                const format = mimeType.replace('image/', '');
                if (format !== 'jpeg' && format !== 'png' && format !== 'gif' && format !== 'webp') {
                    throw new Error('Unsupported Bedrock image format.');
                }
                content.push({ image: { format, source: { bytes: Buffer.from(data, 'base64') } } });
            }
            const hasSampling = temperature !== undefined || topP !== undefined || maxTokens !== undefined;
            const request: ConverseCommandInput = { modelId, messages: [{ role: 'user', content }],
                system: prompt.system && !options.systemInUserMessage ? [{ text: prompt.system }] : undefined,
                inferenceConfig: hasSampling ? { temperature, topP, maxTokens } : undefined,
                additionalModelRequestFields: parameters as ConverseCommandInput['additionalModelRequestFields'],
            };
            if (streaming === false) {
                const response = await client.send(new ConverseCommand(request), { abortSignal });
                for (const block of response.output?.message?.content ?? []) if (block.text) yield block.text;
            } else {
                const response = await client.send(new ConverseStreamCommand(request), { abortSignal });
                let finished = false;
                for await (const event of response.stream ?? []) {
                    if (event.contentBlockDelta?.delta?.text) yield event.contentBlockDelta.delta.text;
                    const exception = Object.keys(event).find(key => key.endsWith('Exception'));
                    if (exception) throw Object.assign(new Error('Bedrock Converse stream failed.'), { name: exception });
                    if (event.messageStop) finished = true;
                }
                if (!finished) throw new Error('Bedrock Converse stream ended before messageStop.');
            }
        } finally {
            client.destroy();
        }
    }
}
