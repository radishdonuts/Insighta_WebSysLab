"use client";

import React, { useState } from "react";
import styles from "./nlp-config.module.css";

const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
    </svg>
);

const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
);

const PlayIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
);

export default function NLPConfigPage() {
    const [provider, setProvider] = useState("gemini");
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [threshold, setThreshold] = useState(0.85);
    const [autoRoute, setAutoRoute] = useState(true);

    const [saving, setSaving] = useState(false);
    const [testText, setTestText] = useState("");
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    // Load config on mount
    React.useEffect(() => {
        fetch("/api/admin/nlp-config")
            .then(res => res.json())
            .then(data => {
                if (data.config) {
                    setProvider(data.config.provider ?? "gemini");
                    setApiKey(data.config.apiKey ?? "");
                    setThreshold(data.config.threshold ?? 0.85);
                    setAutoRoute(data.config.autoRoute ?? true);
                }
                setLoaded(true);
            })
            .catch(() => setLoaded(true));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/nlp-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, apiKey, threshold, autoRoute }),
            });
            const data = await res.json();
            alert(data.message || "Configuration saved.");
        } catch {
            alert("Failed to save configuration.");
        }
        setSaving(false);
    };

    const handleTest = async () => {
        if (!testText.trim()) return;
        setTestLoading(true);
        setTestResult(null);

        try {
            const res = await fetch("/api/nlp/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: testText, ticketId: "test-eval-123" })
            });

            const payload = await res.json();
            setTestResult(JSON.stringify(payload, null, 2));
        } catch (e) {
            setTestResult(JSON.stringify({ error: "Failed to connect to backend", detail: String(e) }, null, 2));
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>NLP Intelligence Configuration</h1>
                <p>Manage models, keys, and thresholds for automated ticket classification and routing.</p>
            </header>

            <div className={styles.grid}>
                {/* Settings Column */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Global Settings</h2>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Language Model Provider</label>
                        <select
                            className={styles.input}
                            value={provider}
                            onChange={e => setProvider(e.target.value)}
                            style={{ paddingRight: '2rem', appearance: 'none' }} // simple simple custom select
                        >
                            <option value="gemini">Google Gemini Pro</option>
                            <option value="openai">OpenAI GPT-4o</option>
                            <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                            <option value="local">Local DeepSeek (vLLM)</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>API Key</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                type={showKey ? "text" : "password"}
                                className={`${styles.input} ${styles.passwordInput}`}
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                            />
                            <button
                                type="button"
                                className={styles.revealBtn}
                                onClick={() => setShowKey(!showKey)}
                                aria-label={showKey ? "Hide API key" : "Show API key"}
                            >
                                {showKey ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Minimum Confidence Threshold</label>
                        <div className={styles.sliderWrapper}>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={threshold * 100}
                                onChange={e => setThreshold(parseFloat(e.target.value) / 100)}
                                className={styles.slider}
                            />
                            <div className={styles.sliderValue}>{threshold.toFixed(2)}</div>
                        </div>
                        <p className={styles.toggleDesc} style={{ marginTop: '0.5rem' }}>
                            Predictions below this confidence score will be flagged for manual review instead of auto-applying.
                        </p>
                    </div>

                    <div className={styles.toggleRow}>
                        <div className={styles.toggleLabel}>
                            <span className={styles.toggleTitle}>Enable Auto-Routing</span>
                            <span className={styles.toggleDesc}>Automatically assign tickets to staff based on extracted category.</span>
                        </div>
                        <button
                            className={styles.toggleSwitch}
                            role="switch"
                            aria-checked={autoRoute}
                            onClick={() => setAutoRoute(!autoRoute)}
                        >
                            <span className={styles.toggleKnob} />
                        </button>
                    </div>

                    <div className={styles.footer}>
                        <button
                            className={styles.btnPrimary}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : "Save Configuration"}
                        </button>
                    </div>
                </section>

                {/* Test Column */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Test Configuration</h2>
                    <p className={styles.toggleDesc} style={{ marginBottom: '1rem' }}>
                        Paste a sample customer complaint below to see how the current model and prompt parse the information.
                    </p>

                    <textarea
                        className={styles.textarea}
                        placeholder="e.g. My car insurance claim was denied yesterday and I am extremely angry..."
                        value={testText}
                        onChange={e => setTestText(e.target.value)}
                    />

                    <button
                        className={styles.btnSecondary}
                        onClick={handleTest}
                        disabled={testLoading || !testText.trim()}
                    >
                        {testLoading ? <span className={styles.spinner} /> : <PlayIcon />}
                        Run Extraction Test
                    </button>

                    {testResult !== null && (
                        <div className={styles.resultBox}>
                            {testResult}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
