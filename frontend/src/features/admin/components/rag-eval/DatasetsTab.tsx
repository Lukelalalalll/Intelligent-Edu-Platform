import React, { useCallback, useEffect, useState } from 'react';
import styles from '../../styles/AdminDashboard.module.css';
import * as api from '../../../../api/ragEvalApi';
import type { Dataset, DatasetSummary } from '../../../../api/ragEvalApi';

export default function DatasetsTab() {
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedDs, setSelectedDs] = useState<Dataset | null>(null);

    const fetchDatasets = useCallback(async () => {
        setLoading(true);
        try {
            setDatasets(await api.listDatasets());
        } catch (e) {
            console.error('Failed to fetch datasets', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDatasets();
    }, [fetchDatasets]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this dataset?')) return;
        await api.deleteDataset(id);
        fetchDatasets();
    };

    const handleView = async (id: string) => {
        try {
            const ds = await api.getDataset(id);
            setSelectedDs(ds);
        } catch (e) {
            console.error('Failed to fetch dataset', e);
        }
    };

    return (
        <div>
            <div className={styles.ragSectionHeader}>
                <h3 className={styles.ragSectionTitle}>Evaluation Datasets</h3>
                <button className={styles.btnPrimary} onClick={() => setShowCreate(!showCreate)}>
                    <i className={`fas fa-plus ${styles.ragInlineIcon}`}></i>
                    {showCreate ? 'Cancel' : 'New Dataset'}
                </button>
            </div>

            {showCreate && <CreateDatasetForm onCreated={() => { setShowCreate(false); fetchDatasets(); }} />}
            {loading && <p>Loading...</p>}

            <table className={`${styles.dataTable} ${styles.ragTableFull}`}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Cases</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {datasets.map(ds => (
                        <tr key={ds.dataset_id}>
                            <td>{ds.name}</td>
                            <td>{ds.description || '-'}</td>
                            <td>{ds.case_count}</td>
                            <td>{new Date(ds.created_at).toLocaleString()}</td>
                            <td>
                                <button className={`${styles.btnSecondary} ${styles.ragButtonInlineGap}`} onClick={() => handleView(ds.dataset_id)}>
                                    View
                                </button>
                                <button className={styles.btnDanger || styles.btnSecondary} onClick={() => handleDelete(ds.dataset_id)}>
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {!loading && datasets.length === 0 && (
                        <tr>
                            <td colSpan={5} className={styles.ragEmptyCell}>
                                No datasets yet
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {selectedDs && (
                <div className={styles.modalOverlay} onClick={() => setSelectedDs(null)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        className={styles.ragModalPanelMd}
                    >
                        <h3>
                            {selectedDs.name} - {selectedDs.case_count} cases
                        </h3>
                        <table className={`${styles.dataTable} ${styles.ragTableCompact}`}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Query</th>
                                    <th>Expected Docs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedDs.cases.map((c, i) => (
                                    <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{c.query}</td>
                                        <td>{c.expected_doc_names?.join(', ') || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button className={`${styles.btnSecondary} ${styles.ragModalCloseBtn}`} onClick={() => setSelectedDs(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function CreateDatasetForm({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [casesText, setCasesText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        const trimmed = name.trim();
        if (!trimmed) {
            setError('Name is required');
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(casesText);
            if (!Array.isArray(parsed) || parsed.length === 0) throw new Error();
        } catch {
            setError('Cases must be a non-empty JSON array. Example:\n[{"query":"What is X?","expected_doc_names":["doc1.pdf"]}]');
            return;
        }

        setSaving(true);
        try {
            await api.createDataset(trimmed, parsed as api.EvalCase[], desc.trim());
            onCreated();
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(message || 'Failed to create dataset');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.ragFormCard}>
            <div className={styles.ragInlineFormRowTight}>
                <input className={`${styles.formInput} ${styles.ragInputFlex1}`} placeholder="Dataset name" value={name} onChange={e => setName(e.target.value)} />
                <input className={`${styles.formInput} ${styles.ragInputFlex2}`} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <textarea
                className={`${styles.formInput} ${styles.ragJsonTextarea}`}
                placeholder={'[\n  { "query": "What is photosynthesis?", "expected_doc_names": ["biology.pdf"] },\n  { "query": "Newton 3rd law",          "expected_doc_names": ["physics.pdf"] }\n]'}
                value={casesText}
                onChange={e => setCasesText(e.target.value)}
                rows={6}
            />
            {error && <p className={styles.ragErrorText}>{error}</p>}
            <button className={`${styles.btnPrimary} ${styles.ragPrimaryTopSpacing}`} onClick={handleSubmit} disabled={saving}>
                {saving ? 'Creating...' : 'Create Dataset'}
            </button>
        </div>
    );
}
