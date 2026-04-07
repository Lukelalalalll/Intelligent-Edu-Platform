import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../api/client';
import AdminDbConsole from '../features/admin/pages/AdminDbConsole';

export default function AdminDbConsoleEntry() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user?.role === 'admin';

    const [collections, setCollections] = useState([]);
    const [collectionLoading, setCollectionLoading] = useState(false);
    const [activeCollection, setActiveCollection] = useState('');

    const [documents, setDocuments] = useState([]);
    const [total, setTotal] = useState(0);
    const [skip, setSkip] = useState(0);
    const [limit, setLimit] = useState(20);
    const [docLoading, setDocLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');

    const [editorText, setEditorText] = useState('{\n  "example": true\n}');
    const [selectedDocId, setSelectedDocId] = useState('');
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const maxPageSkip = useMemo(() => Math.max(total - limit, 0), [total, limit]);
    const relationReadOnly = useMemo(() => /relation/i.test(activeCollection || ''), [activeCollection]);

    const fetchCollections = async () => {
        try {
            setCollectionLoading(true);
            const res = await client.get('/admin/db/collections');
            const list = res.data?.collections || [];
            setCollections(list);
            if (!activeCollection && list.length > 0) {
                setActiveCollection(list[0].name);
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || 'Failed to load collections');
        } finally {
            setCollectionLoading(false);
        }
    };

    const fetchDocuments = async (collectionName, nextSkip = skip, nextLimit = limit, keyword = debouncedSearchText) => {
        if (!collectionName) return;
        try {
            setDocLoading(true);
            setErrorMsg('');
            const res = await client.get(`/admin/db/${collectionName}/documents`, {
                params: { skip: nextSkip, limit: nextLimit, q: keyword },
            });
            const docs = res.data?.documents || [];
            setDocuments(docs);
            setTotal(res.data?.total || 0);

            if (docs.length > 0) {
                const firstId = String(docs[0]._id || '');
                setSelectedDocId(firstId);
                setSelectedDoc(docs[0]);
                setEditorText(JSON.stringify(docs[0], null, 2));
            } else {
                setSelectedDocId('');
                setSelectedDoc(null);
                setEditorText('{\n  "example": true\n}');
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || 'Failed to load documents');
        } finally {
            setDocLoading(false);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, []);

    useEffect(() => {
        setSkip(0);
    }, [activeCollection]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText.trim());
        }, 240);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        fetchDocuments(activeCollection, skip, limit, debouncedSearchText);
    }, [activeCollection, skip, limit, debouncedSearchText]);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const selectDocument = (doc) => {
        setSelectedDocId(String(doc._id || ''));
        setSelectedDoc(doc);
        setEditorText(JSON.stringify(doc, null, 2));
    };

    const parseEditorJson = () => {
        try {
            const parsed = JSON.parse(editorText);
            return parsed;
        } catch (_) {
            throw new Error('JSON format is invalid');
        }
    };

    const createDocument = async () => {
        if (!activeCollection) return;
        if (relationReadOnly) {
            setErrorMsg('Relation collections are read-only in DB Console. Please use Relation Management in Admin Dashboard.');
            return;
        }
        try {
            setIsSaving(true);
            setErrorMsg('');
            const parsed = parseEditorJson();
            await client.post(`/admin/db/${activeCollection}/documents`, { document: parsed });
            await fetchCollections();
            await fetchDocuments(activeCollection, skip, limit, debouncedSearchText);
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || error.message || 'Create failed');
        } finally {
            setIsSaving(false);
        }
    };

    const updateDocument = async () => {
        if (!activeCollection || !selectedDocId) return;
        if (relationReadOnly) {
            setErrorMsg('Relation collections are read-only in DB Console. Please use Relation Management in Admin Dashboard.');
            return;
        }
        try {
            setIsSaving(true);
            setErrorMsg('');
            const parsed = parseEditorJson();
            await client.put(`/admin/db/${activeCollection}/documents/${selectedDocId}`, { document: parsed });
            await fetchDocuments(activeCollection, skip, limit, debouncedSearchText);
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || error.message || 'Update failed');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteDocument = async () => {
        if (!activeCollection || !selectedDocId) return;
        if (relationReadOnly) {
            setErrorMsg('Relation collections are read-only in DB Console. Please use Relation Management in Admin Dashboard.');
            return;
        }
        if (!window.confirm('Delete selected document? This action cannot be undone.')) return;

        try {
            setIsSaving(true);
            setErrorMsg('');
            await client.delete(`/admin/db/${activeCollection}/documents/${selectedDocId}`);
            await fetchCollections();
            const safeSkip = Math.min(skip, maxPageSkip);
            setSkip(safeSkip);
            await fetchDocuments(activeCollection, safeSkip, limit, debouncedSearchText);
        } catch (error) {
            setErrorMsg(error.response?.data?.detail || 'Delete failed');
        } finally {
            setIsSaving(false);
        }
    };

    const goPrev = () => setSkip((prev) => Math.max(prev - limit, 0));
    const goNext = () => setSkip((prev) => Math.min(prev + limit, maxPageSkip));

    return (
        <AdminDbConsole
            collections={collections}
            collectionLoading={collectionLoading}
            activeCollection={activeCollection}
            setActiveCollection={setActiveCollection}
            documents={documents}
            docLoading={docLoading}
            selectedDocId={selectedDocId}
            selectDocument={selectDocument}
            editorText={editorText}
            setEditorText={setEditorText}
            total={total}
            skip={skip}
            limit={limit}
            setLimit={setLimit}
            searchText={searchText}
            setSearchText={setSearchText}
            goPrev={goPrev}
            goNext={goNext}
            canPrev={skip > 0}
            canNext={skip + limit < total}
            createDocument={createDocument}
            updateDocument={updateDocument}
            deleteDocument={deleteDocument}
            isSaving={isSaving}
            errorMsg={errorMsg}
            selectedDoc={selectedDoc}
            relationReadOnly={relationReadOnly}
        />
    );
}
