import { useEffect, useState } from 'react';
import type { BedrockSettings } from '../../types/bedrock';
import { ProviderCard } from './ProviderCard';
import { ModelSelect } from './AIProvidersSettings';

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
                // The backend tries the selected model, resolves inference-profile IDs itself,
                // and falls back to Amazon Nova so a valid key always passes.
                const chosen = rows.some(row => row.id === defaultModel) ? defaultModel.slice('bedrock/'.length) : undefined;
                const result = await window.electronAPI.testBedrockModel(chosen);
                if (!result.success) throw new Error(`${settings?.region ?? region}: ${result.error ?? 'The request failed.'}`);
                setTestStatus('success');
                return result.warning ?? '';
            } catch (error) {
                setTestStatus('error');
                throw error;
            }
        });
    };

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
            </details>}
        />
    );
}
