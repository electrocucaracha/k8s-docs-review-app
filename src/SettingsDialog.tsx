import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  PlugZap,
  Save,
  X,
  ListChecks,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { providerDefaults, requestLLMReview, validateSettings } from "./llm";
import type { LLMSettings, Provider } from "./llm";
import { defaultTasks } from "./reviewTasks";
import type { ReviewTask } from "./reviewTasks";

type Props = {
  settings: LLMSettings;
  onSave: (settings: LLMSettings) => void;
  onClose: () => void;
};

export function SettingsDialog({ settings, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState("");
  const [section, setSection] = useState<"provider" | "tasks">("provider");
  const [editingTask, setEditingTask] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function update(change: Partial<LLMSettings>) {
    setDraft((current) => ({ ...current, ...change }));
    setError("");
    setConnected("");
  }

  function updateTask(id: string, change: Partial<ReviewTask>) {
    update({
      tasks: draft.tasks.map((task) =>
        task.id === id ? { ...task, ...change } : task,
      ),
    });
  }

  async function testConnection() {
    setError("");
    setConnected("");
    setBusy(true);
    try {
      validateSettings(draft);
      const result = await requestLLMReview({
        action: "test",
        settings: draft,
      });
      setConnected(result.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            validateSettings(draft);
            onSave(draft);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <div className="dialog-heading">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="icon-button"
            title="Close settings"
            aria-label="Close settings"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === "provider"}
            disabled={busy}
            onClick={() => setSection("provider")}
          >
            <PlugZap size={14} />
            Provider
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "tasks"}
            disabled={busy}
            onClick={() => setSection("tasks")}
          >
            <ListChecks size={14} />
            Review Tasks
          </button>
        </div>
        <div hidden={section !== "provider"}>
          <h3>LLM Provider</h3>
          <fieldset disabled={busy} className="settings-fields">
            <label>
              Provider
              <select
                aria-label="LLM provider"
                value={draft.provider}
                onChange={(event) =>
                  update({
                    ...providerDefaults[event.target.value as Provider],
                    pythonExecutable: draft.pythonExecutable,
                  })
                }
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai-compatible">
                  OpenAI-compatible / LiteLLM Proxy
                </option>
              </select>
            </label>
            <label>
              Model
              <input
                aria-label="LLM model"
                value={draft.model}
                maxLength={200}
                onChange={(event) => update({ model: event.target.value })}
                required
              />
            </label>
            <label>
              API endpoint
              <input
                aria-label="LLM API endpoint"
                type="url"
                value={draft.apiBase}
                maxLength={2048}
                placeholder="Provider default"
                onChange={(event) => update({ apiBase: event.target.value })}
              />
            </label>
            <label>
              API key (session only)
              <input
                aria-label="LLM API key"
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                maxLength={4096}
                onChange={(event) => update({ apiKey: event.target.value })}
              />
            </label>
            <details>
              <summary>Python Runtime</summary>
              <label>
                Python executable
                <input
                  aria-label="Python executable"
                  value={draft.pythonExecutable}
                  placeholder="Automatic"
                  onChange={(event) =>
                    update({ pythonExecutable: event.target.value })
                  }
                />
              </label>
            </details>
          </fieldset>
        </div>
        <div hidden={section !== "tasks"}>
          <fieldset className="task-settings" disabled={busy}>
            <label className="task-concurrency">
              Parallel task limit
              <select
                aria-label="Parallel task limit"
                value={draft.concurrency}
                onChange={(event) =>
                  update({ concurrency: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4].map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
            <div className="task-definitions">
              {draft.tasks.map((task) => (
                <div className="task-definition" key={task.id}>
                  <div className="task-definition-heading">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Enable ${task.name}`}
                        checked={task.enabled}
                        onChange={(event) =>
                          updateTask(task.id, { enabled: event.target.checked })
                        }
                      />
                      <span>{task.name}</span>
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      title={`Edit ${task.name}`}
                      aria-label={`Edit ${task.name}`}
                      onClick={() =>
                        setEditingTask(editingTask === task.id ? null : task.id)
                      }
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title={`Remove ${task.name}`}
                      aria-label={`Remove ${task.name}`}
                      onClick={() =>
                        update({
                          tasks: draft.tasks.filter(
                            (item) => item.id !== task.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {editingTask === task.id && (
                    <div className="task-editor">
                      <label>
                        Task name
                        <input
                          aria-label="Task name"
                          maxLength={80}
                          value={task.name}
                          onChange={(event) =>
                            updateTask(task.id, { name: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Instructions
                        <textarea
                          aria-label="Task instructions"
                          maxLength={4000}
                          value={task.instructions}
                          onChange={(event) =>
                            updateTask(task.id, {
                              instructions: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="task-definition-actions">
              <button
                type="button"
                disabled={draft.tasks.length >= 20}
                onClick={() => {
                  const task = {
                    id: `custom-${crypto.randomUUID()}`,
                    name: "New review task",
                    instructions:
                      "Review the document pair for a specific documentation concern.",
                    enabled: true,
                  };
                  update({ tasks: [...draft.tasks, task] });
                  setEditingTask(task.id);
                }}
              >
                <Plus size={14} />
                Add task
              </button>
              <button
                type="button"
                onClick={() => {
                  update({
                    tasks: defaultTasks.map((task) => ({ ...task })),
                    concurrency: 1,
                  });
                  setEditingTask(null);
                }}
              >
                <RotateCcw size={14} />
                Restore defaults
              </button>
            </div>
          </fieldset>
        </div>
        {error && (
          <div className="settings-error" role="alert">
            {error}
          </div>
        )}
        {connected && (
          <div className="settings-connected" role="status">
            <Check size={15} />
            {connected}
          </div>
        )}
        <div className="dialog-actions">
          {section === "provider" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void testConnection()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <PlugZap size={15} />
              )}
              Test connection
            </button>
          )}
          <button type="submit" className="primary" disabled={busy}>
            <Save size={15} />
            Save settings
          </button>
        </div>
      </form>
    </dialog>
  );
}
