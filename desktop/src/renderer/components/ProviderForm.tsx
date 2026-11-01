import React, { useState } from 'react';
import { useAppState, useStore } from '../hooks';

// Shared by the first-run checklist and the settings page. The stored key is never shown or sent back:
// leaving the key field empty keeps the saved one.
export function ProviderForm(props: { compact?: boolean; onSaved?: () => void }): React.ReactElement {
  const store = useStore();
  const { provider } = useAppState();
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState(provider.modelIds.join(', '));
  const [active, setActive] = useState(provider.activeModelId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const modelIds = models.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const hasKey = provider.configured || apiKey.trim() !== '';

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    setSaving(true);
    const chosen = modelIds.includes(active) ? active : modelIds[0] || '';
    const result = await store.saveProvider({ baseUrl: baseUrl.trim(), apiKey, modelIds, activeModelId: chosen });
    setSaving(false);
    if (!result.ok) {
      setError(result.error || '保存失败');
      return;
    }
    setApiKey('');
    props.onSaved?.();
  }

  return (
    <form className={`form${props.compact ? ' form-compact' : ''}`} onSubmit={(event) => void submit(event)} noValidate>
      <div className="field">
        <label htmlFor="provider-url">接口地址</label>
        <input id="provider-url" type="url" inputMode="url" value={baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} autoComplete="off" spellCheck={false} />
        <p className="hint">任何兼容 OpenAI 格式的服务都可以。</p>
      </div>

      <div className="field">
        <label htmlFor="provider-key">API Key</label>
        <input
          id="provider-key"
          type="password"
          value={apiKey}
          placeholder={provider.configured ? `已保存 ${provider.apiKeyMasked}，留空则保持不变` : 'sk-…'}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="hint">只保存在你这台电脑上，界面里不会再次显示完整内容。</p>
      </div>

      <div className="field">
        <label htmlFor="provider-models">模型 ID</label>
        <input id="provider-models" type="text" value={models} placeholder="deepseek-chat, glm-4.6" onChange={(event) => setModels(event.target.value)} autoComplete="off" spellCheck={false} />
        <p className="hint">多个用逗号隔开。</p>
      </div>

      {modelIds.length > 1 && (
        <div className="field">
          <label htmlFor="provider-active">当前使用</label>
          <select id="provider-active" value={modelIds.includes(active) ? active : modelIds[0]} onChange={(event) => setActive(event.target.value)}>
            {modelIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !baseUrl.trim() || !hasKey || modelIds.length === 0}>
          {saving ? '保存中…' : provider.configured ? '保存修改' : '保存并继续'}
        </button>
      </div>
    </form>
  );
}
