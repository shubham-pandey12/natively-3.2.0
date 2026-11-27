import { useEffect, useState } from 'react';
import type { BedrockApi, BedrockModelOptions, BedrockSettings } from '../../types/bedrock';
import { defaultBedrockOptions } from '../../types/bedrock';
import { ProviderCard } from './ProviderCard';
import { ModelSelect } from './AIProvidersSettings';

const apis: Record<BedrockApi, string> = {
    converse: 'Converse',
    invoke: 'InvokeModel (native JSON)',
    'runtime-chat': 'Runtime Chat Completions',
    'runtime-responses': 'Runtime Responses',
    'runtime-messages': 'Runtime Claude Messages',
    'mantle-chat': 'Mantle Chat Completions',
    'mantle-responses': 'Mantle Responses',
    'mantle-messages': 'Mantle Claude Messages',
};
const AWS_BEDROCK_REGIONS = [
    { id: 'us-east-1', name: 'US East (N. Virginia) · us-east-1' },
    { id: 'us-east-2', name: 'US East (Ohio) · us-east-2' },
    { id: 'us-west-1', name: 'US West (N. California) · us-west-1' },
    { id: 'us-west-2', name: 'US West (Oregon) · us-west-2' },
    { id: 'ap-south-1', name: 'Asia Pacific (Mumbai) · ap-south-1' },
    { id: 'ap-south-2', name: 'Asia Pacific (Hyderabad) · ap-south-2' },
    { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore) · ap-southeast-1' },
    { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney) · ap-southeast-2' },
    { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo) · ap-northeast-1' },
    { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul) · ap-northeast-2' },
    { id: 'ap-northeast-3', name: 'Asia Pacific (Osaka) · ap-northeast-3' },
    { id: 'ap-east-1', name: 'Asia Pacific (Hong Kong) · ap-east-1' },
    { id: 'ca-central-1', name: 'Canada (Central) · ca-central-1' },
    { id: 'ca-west-1', name: 'Canada West (Calgary) · ca-west-1' },
    { id: 'eu-central-1', name: 'Europe (Frankfurt) · eu-central-1' },
    { id: 'eu-central-2', name: 'Europe (Zurich) · eu-central-2' },
    { id: 'eu-west-1', name: 'Europe (Ireland) · eu-west-1' },
    { id: 'eu-west-2', name: 'Europe (London) · eu-west-2' },
    { id: 'eu-west-3', name: 'Europe (Paris) · eu-west-3' },
    { id: 'eu-north-1', name: 'Europe (Stockholm) · eu-north-1' },
    { id: 'eu-south-1', name: 'Europe (Milan) · eu-south-1' },
    { id: 'eu-south-2', name: 'Europe (Spain) · eu-south-2' },
    { id: 'il-central-1', name: 'Israel (Tel Aviv) · il-central-1' },
    { id: 'me-central-1', name: 'Middle East (UAE) · me-central-1' },
    { id: 'me-south-1', name: 'Middle East (Bahrain) · me-south-1' },
    { id: 'sa-east-1', name: 'South America (São Paulo) · sa-east-1' },
    { id: 'af-south-1', name: 'Africa (Cape Town) · af-south-1' },
];
const CUSTOM_REGION_ID = '__custom__';
const input = 'aip-input w-full rounded-md border border-border-subtle bg-bg-input px-2 py-1.5';
const button = 'aip-btn';

function jsonObject(value: string): Record<string, unknown> | undefined {
    if (!value.trim()) return undefined;
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Model settings must be JSON objects.');
    return parsed;
}

interface Props {
    defaultModel: string;
    disabled: boolean;
    enabledModels: string[];
    onToggleDisabled(enabled: boolean): void;
    onToggleModel(id: string, universe: string[]): void;
    onResetModels(): void;
    onDefault(id: string): Promise<void>;
}
export function BedrockSettingsCard({ defaultModel, disabled, enabledModels, onToggleDisabled, onToggleModel, onResetModels, onDefault }: Props) {
    const [settings, setSettings] = useState<BedrockSettings>();
    const [region, setRegion] = useState('us-east-1');
    const [useCustomRegion, setUseCustomRegion] = useState(false);
    const [auth, setAuth] = useState<BedrockSettings['auth']>('bearer');
    const [key, setKey] = useState('');
    const [model, setModel] = useState('');
    const [options, setOptions] = useState<BedrockModelOptions>({ api: 'converse' });
    const [parameters, setParameters] = useState('');
    const [nativeInput, setNativeInput] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

    useEffect(() => {
        let mounted = true;
        window.electronAPI?.getBedrockSettings?.().then(saved => {
            if (!mounted) return;
            setSettings(saved);
            setRegion(saved.region);
            setUseCustomRegion(!AWS_BEDROCK_REGIONS.some(row => row.id === saved.region));
            setAuth(saved.configured ? saved.auth : 'bearer');
        }).catch(() => { if (mounted) setStatus('Bedrock settings could not be loaded.'); });
        return () => { mounted = false; };
    }, []);

    const select = (id: string) => {
        setModel(id);
        const metadata = settings?.models.find(row => row.id === id);
        const saved = settings && Object.hasOwn(settings.options, id) ? settings.options[id] : undefined;
        const next = saved ?? defaultBedrockOptions(id, metadata);
        setOptions(next);
        setParameters(next.parameters ? JSON.stringify(next.parameters, null, 2) : '');
        setNativeInput(next.nativeInput ? JSON.stringify(next.nativeInput, null, 2) : '');
    };

    const run = async (action: () => Promise<string>) => {
        setBusy(true);
        setStatus('');
        try { setStatus(await action()); }
        catch (error) { setStatus(error instanceof Error ? error.message : 'Bedrock settings could not be updated.'); }
        finally { setBusy(false); }
    };

    const refresh = async () => {
        const result = await window.electronAPI.refreshBedrockModels();
        if (!result.success) throw new Error(result.error);
        setSettings(await window.electronAPI.getBedrockSettings());
        return result.warnings?.length ? result.warnings.join(' ') : `Found ${result.models?.length ?? 0} models and inference profiles.`;
    };

    const saveConnection = () => run(async () => {
        setTestStatus('idle');
        const result = await window.electronAPI.setBedrockConnection({ region, auth, apiKey: key });
        if (!result.success) throw new Error(result.error);
        setKey('');
        setSettings(await window.electronAPI.getBedrockSettings());
        await refresh();
        return '';
    });

    const removeConnection = () => run(async () => {
        const result = await window.electronAPI.setBedrockConnection(null);
        if (!result.success) throw new Error(result.error);
        setKey('');
        setTestStatus('idle');
        setSettings(await window.electronAPI.getBedrockSettings());
        return '';
    });

    const testConnection = async () => {
        setTestStatus('testing');
        await run(async () => {
            try {
                const eligible = rows.filter(row => !enabledModels.length || enabledModels.includes(row.id));
                const active = eligible.find(row => row.id === defaultModel)
                    ?? eligible.find(row => /^bedrock\/(?:[a-z]+\.)?amazon\.nova-(?:2-)?(?:lite|micro)(?:-|:)/.test(row.id))
                    ?? eligible[0];
                if (!active) throw new Error('Discover models or add a model ID before testing.');
                const result = await window.electronAPI.testBedrockModel(active.id.slice('bedrock/'.length));
                if (!result.success) {
                    throw new Error(`Tested ${active.id.slice('bedrock/'.length)} in ${settings?.region ?? region}. ${result.error ?? 'The request failed.'}`);
                }
                setTestStatus('success');
                return '';
            } catch (error) {
                setTestStatus('error');
                throw error;
            }
        });
    };

    const saveModel = () => run(async () => {
        const id = model.trim();
        if (!id) throw new Error('Enter a model ID or ARN.');
        const result = await window.electronAPI.setBedrockModelOptions(id, {
            ...options, parameters: jsonObject(parameters),
            nativeInput: options.api === 'invoke' ? jsonObject(nativeInput) : undefined,
        });
        if (!result.success) throw new Error(result.error);
        setSettings(await window.electronAPI.getBedrockSettings());
        return '';
    });

    const catalogue = new Map(settings?.models.map(row => [row.id, row.label]));
    for (const id of Object.keys(settings?.options ?? {})) if (!catalogue.has(id)) catalogue.set(id, id);
    const rows = [...catalogue].map(([id, label]) => ({ id: `bedrock/${id}`, label }));
    if (!settings) return status ? <p className="aip-meta" role="status">{status}</p> : null;
    return (
        <ProviderCard providerId="bedrock" providerName="Amazon Bedrock"
            apiKey={key} onKeyChange={setKey} onSaveKey={saveConnection} onRemoveKey={() => void removeConnection()}
            hasStoredKey={settings.hasApiKey} connectionReady={settings.configured}
            savingStatus={busy} savedStatus={false}
            keyPlaceholder="Bedrock API key" keyUrl="https://console.aws.amazon.com/bedrock/"
            onTestConnection={() => void testConnection()} testStatus={testStatus} keyWriteError={status}
            preferredModel={rows.some(row => row.id === defaultModel) ? defaultModel : ''}
            selectableModels={rows} enabledModels={enabledModels} hasCatalog={settings.models.length > 0}
            fetchModels={async () => { await refresh(); }}
            isDisabled={disabled} onToggleDisabled={onToggleDisabled}
            onToggleModel={id => onToggleModel(id, rows.map(row => row.id))}
            onResetModels={onResetModels}
            onSetDefaultModel={id => void run(async () => { await onDefault(id); return ''; })}
            credentialControls={auth === 'aws' ? <div className="aip-provider-row">
                <span className="aip-meta">AWS SDK credentials</span>
                <button className={button} disabled={busy} onClick={() => void saveConnection()}>Save</button>
                {settings.configured && <button className={button} disabled={busy} onClick={() => void removeConnection()}>Remove connection</button>}
            </div> : undefined}
            extraControls={<details className="space-y-2 text-text-primary">
                <summary className="aip-meta cursor-pointer">AWS settings ({settings.region})</summary>
                <div>AWS Region<ModelSelect
                    value={useCustomRegion || !AWS_BEDROCK_REGIONS.some(row => row.id === region) ? CUSTOM_REGION_ID : region}
                    onChange={value => {
                        if (value === CUSTOM_REGION_ID) {
                            setUseCustomRegion(true);
                        } else {
                            setUseCustomRegion(false);
                            setRegion(value);
                        }
                    }}
                    options={[...AWS_BEDROCK_REGIONS, { id: CUSTOM_REGION_ID, name: 'Custom region…' }]}
                /></div>
                {(useCustomRegion || !AWS_BEDROCK_REGIONS.some(row => row.id === region)) && (
                    <label className="block">Custom AWS Region<input className={input} value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. us-gov-west-1" /></label>
                )}
                <div>Authentication<ModelSelect value={auth} onChange={value => { setAuth(value as typeof auth); setKey(''); }}
                    options={[{ id: 'bearer', name: 'Bedrock API key' }, { id: 'aws', name: 'AWS credentials (SDK credential chain)' }]} /></div>
                {auth === 'bearer' && settings.hasApiKey && (region.trim().toLowerCase() !== settings.region || auth !== settings.auth) &&
                    <button className={button} disabled={busy} onClick={() => void saveConnection()}>Save AWS settings</button>}
                {settings.configured && !disabled && <details className="space-y-2">
                <summary className="aip-meta cursor-pointer">Advanced model settings</summary>
                <ModelSelect value={model} onChange={select} placeholder="Select a model or inference profile"
                    options={[...catalogue].map(([id, name]) => ({ id, name }))} />
                <label className="block">Model ID or ARN<input className={input} value={model} onChange={e => select(e.target.value)} /></label>
                <div>Inference API<ModelSelect value={options.api} onChange={api => setOptions({ ...options, api: api as BedrockApi })}
                    options={Object.entries(apis).map(([id, name]) => ({ id, name }))} /></div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={options.streaming !== false}
                    onChange={e => setOptions({ ...options, streaming: e.target.checked })} /> Stream responses</label>
                {options.api === 'converse' && <label className="flex items-center gap-2"><input type="checkbox" checked={options.systemInUserMessage ?? false}
                    onChange={e => setOptions({ ...options, systemInUserMessage: e.target.checked })} /> Put system instructions in the user message</label>}
                {(options.api === 'mantle-chat' || options.api === 'mantle-responses') && <div>Mantle endpoint path
                    <ModelSelect value={String(options.mantleOpenAiPath ?? 'auto')}
                        onChange={value => setOptions({ ...options, mantleOpenAiPath: value === 'auto' ? undefined : value === 'true' })}
                        options={[{ id: 'auto', name: 'Automatic' }, { id: 'false', name: '/v1' }, { id: 'true', name: '/openai/v1' }]} />
                </div>}
                {options.api !== 'invoke' && <div className="grid grid-cols-3 gap-2">
                    {([['maxTokens', 'Max tokens'], ['temperature', 'Temperature'], ['topP', 'Top P']] as const).map(([field, label]) =>
                        <label key={field}>{label}<input className={input} type="number" step={field === 'maxTokens' ? 1 : 0.01}
                            value={options[field] ?? ''} onChange={e => setOptions({ ...options, [field]: e.target.value ? Number(e.target.value) : undefined })} /></label>)}
                </div>}
                <label className="block">Model parameters and reasoning (JSON)
                    <textarea className={input} rows={2} value={parameters} onChange={e => setParameters(e.target.value)} />
                </label>
                <a className="underline" href="https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html"
                    onClick={e => { e.preventDefault(); void window.electronAPI.openExternal(e.currentTarget.href); }}>
                    AWS model API compatibility
                </a>
                {options.api === 'invoke' && <>
                    <label className="block">Native request (JSON)
                        <textarea className={input} rows={3} value={nativeInput} onChange={e => setNativeInput(e.target.value)} />
                    </label>
                    <p>{'Use ${prompt}, ${system}, or ${image.0} inside strings, and "$images" for an array of base64 images.'}</p>
                    <label className="block">Response text path<input className={input} value={options.nativeTextPath ?? ''}
                        placeholder="content.0.text" onChange={e => setOptions({ ...options, nativeTextPath: e.target.value })} /></label>
                </>}
                <button className={button} disabled={busy || !model.trim()} onClick={() => void saveModel()}>Save model settings</button>
                </details>}
            </details>}
        />
    );
}
