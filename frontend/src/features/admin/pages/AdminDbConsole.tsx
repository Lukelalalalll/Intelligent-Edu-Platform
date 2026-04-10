import React from 'react';
import styles from '../styles/AdminDbConsole.module.css';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';

function RelationGraph({ doc }) {
    if (!doc) {
        return <div className={styles.hint}>Select a relation document to visualize.</div>;
    }

    const courseId = doc.courseId || doc.id || 'Unknown Course';
    const courseName = doc.name || 'Unnamed Course';
    const teacherId = doc.teacherId || 'Unassigned';
    const degree = doc.degreeLevel || 'N/A';
    const semester = doc.semester || 'N/A';
    const students = Array.isArray(doc.studentList) ? doc.studentList : [];
    const assignments = Array.isArray(doc.assignments) ? doc.assignments : [];

    return (
        <div className={styles.relationCanvas}>
            <div className={styles.relationNodePrimary}>
                <div className={styles.nodeLabel}>Course</div>
                <strong>{courseId}</strong>
                <div className={styles.nodeSub}>{courseName}</div>
                <div className={styles.nodeMetaRow}>
                    <span>{degree}</span>
                    <span>{semester}</span>
                </div>
            </div>

            <div className={styles.relationLinksRow}>
                <div className={styles.relationNode}>
                    <div className={styles.nodeLabel}>Teacher</div>
                    <div className={styles.nodeValue}>{teacherId}</div>
                </div>

                <div className={styles.relationArrow}>
                    <i className="fas fa-long-arrow-alt-right"></i>
                </div>

                <div className={styles.relationNode}>
                    <div className={styles.nodeLabel}>Students</div>
                    <div className={styles.nodeValue}>{students.length} linked</div>
                </div>

                <div className={styles.relationArrow}>
                    <i className="fas fa-long-arrow-alt-right"></i>
                </div>

                <div className={styles.relationNode}>
                    <div className={styles.nodeLabel}>Assignments</div>
                    <div className={styles.nodeValue}>{assignments.length} linked</div>
                </div>
            </div>

            <div className={styles.relationDetailsGrid}>
                <div className={styles.relationDetailCol}>
                    <h4>Student List</h4>
                    {students.length === 0 ? (
                        <div className={styles.hint}>No students linked</div>
                    ) : (
                        <div className={styles.relationChipWrap}>
                            {students.map((s, idx) => (
                                <span key={`${s.studentId || idx}`} className={styles.relationChip}>
                                    {s.studentId || 'Unknown'}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.relationDetailCol}>
                    <h4>Assignments</h4>
                    {assignments.length === 0 ? (
                        <div className={styles.hint}>No assignments linked</div>
                    ) : (
                        <div className={styles.relationAssignmentList}>
                            {assignments.map((a, idx) => (
                                <div key={`${a.id || idx}`} className={styles.relationAssignmentItem}>
                                    <strong>{a.id || 'Untitled'}</strong>
                                    <span>{a.title || 'No title'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminDbConsole({
    collections,
    collectionLoading,
    activeCollection,
    setActiveCollection,
    documents,
    docLoading,
    selectedDocId,
    selectDocument,
    editorText,
    setEditorText,
    total,
    skip,
    limit,
    setLimit,
    searchText,
    setSearchText,
    goPrev,
    goNext,
    canPrev,
    canNext,
    createDocument,
    updateDocument,
    deleteDocument,
    isSaving,
    errorMsg,
    selectedDoc,
    relationReadOnly,
}) {
    const readOnlyMode = relationReadOnly;
    const isUserCollection = /user/i.test(activeCollection || '');
    const isCourseCollection = /course/i.test(activeCollection || '');

    let schemaHint = 'Use valid JSON document format';
    if (isUserCollection) {
        schemaHint = 'Suggested fields: username, email, role, password';
    } else if (isCourseCollection) {
        schemaHint = 'Suggested fields: courseId, name, teacherId, semester, studentList, assignments';
    }

    return (
        <div className={styles.pageWrap}>
            <WelcomeBanner
                title="Database Console"
                subtitle="Visual browser and editor for MongoDB collections"
            />

            <div className={styles.consoleGrid}>
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarTitle}>Collections</div>
                    {collectionLoading ? (
                        <div className={styles.hint}>Loading collections...</div>
                    ) : collections.length === 0 ? (
                        <div className={styles.hint}>No collections found</div>
                    ) : (
                        <div className={styles.collectionList}>
                            {collections.map((c) => (
                                <button
                                    key={c.name}
                                    className={`${styles.collectionItem} ${activeCollection === c.name ? styles.collectionItemActive : ''}`}
                                    onClick={() => setActiveCollection(c.name)}
                                >
                                    <span>{c.name}</span>
                                    <span className={styles.countPill}>{c.count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className={styles.mainPanel}>
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarLeft}>
                            <strong>{activeCollection || 'No collection selected'}</strong>
                            <span className={styles.meta}>Total: {total}</span>
                            {readOnlyMode && <span className={styles.readOnlyTag}>Relation: Read-only</span>}
                        </div>
                        <div className={styles.toolbarRight}>
                            <input
                                className={styles.searchInput}
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder={activeCollection === 'users' ? 'Search username/email...' : 'Search by keyword...'}
                            />
                            <label className={styles.limitLabel}>
                                Page Size
                                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                            </label>
                            <button onClick={goPrev} disabled={!canPrev}>Prev</button>
                            <button onClick={goNext} disabled={!canNext}>Next</button>
                        </div>
                    </div>

                    <div className={styles.contentGrid}>
                        <div className={styles.docListPanel}>
                            <h3>Documents</h3>
                            {docLoading ? (
                                <div className={styles.hint}>Loading documents...</div>
                            ) : documents.length === 0 ? (
                                <div className={styles.hint}>No documents in this page</div>
                            ) : (
                                <div className={styles.docList}>
                                    {documents.map((doc) => {
                                        const id = String(doc._id || '');
                                        const preview = JSON.stringify(doc).slice(0, 88);
                                        return (
                                            <button
                                                key={id}
                                                className={`${styles.docItem} ${selectedDocId === id ? styles.docItemActive : ''}`}
                                                onClick={() => selectDocument(doc)}
                                            >
                                                <div className={styles.docId}>{id || 'new-document'}</div>
                                                <div className={styles.docPreview}>{preview}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className={styles.editorPanel}>
                            <h3>{readOnlyMode ? 'Relation Visualization' : 'JSON Editor'}</h3>
                            {readOnlyMode ? (
                                <RelationGraph doc={selectedDoc} />
                            ) : (
                                <div className={styles.editorShell}>
                                    <div className={styles.editorToolbar}>
                                        <div className={styles.editorDots}>
                                            <span></span>
                                            <span></span>
                                            <span></span>
                                        </div>
                                        <span className={styles.editorCollectionBadge}>{activeCollection || 'collection'}</span>
                                        <span className={styles.editorHintLabel}>JSON</span>
                                    </div>

                                    <div className={styles.editorHintRow}>
                                        <span className={styles.editorHintChip}>{schemaHint}</span>
                                    </div>

                                    <textarea
                                        className={styles.editor}
                                        value={editorText}
                                        onChange={(e) => setEditorText(e.target.value)}
                                        spellCheck={false}
                                    />

                                    <div className={styles.editorFooter}>Tip: Keep keys in double quotes and avoid trailing commas.</div>
                                </div>
                            )}
                            {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

                            <div className={styles.actionRow}>
                                <button className={styles.btnPrimary} onClick={createDocument} disabled={isSaving || !activeCollection || readOnlyMode}>Create New</button>
                                <button className={styles.btnAccent} onClick={updateDocument} disabled={isSaving || !selectedDocId || readOnlyMode}>Update Selected</button>
                                <button className={styles.btnDanger} onClick={deleteDocument} disabled={isSaving || !selectedDocId || readOnlyMode}>Delete Selected</button>
                            </div>
                            {readOnlyMode && <div className={styles.paginationHint}>This collection is protected in DB Console and can only be maintained in Relation Management.</div>}
                            <div className={styles.paginationHint}>Showing {documents.length} items, offset {skip}</div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
