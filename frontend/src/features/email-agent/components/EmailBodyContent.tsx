import React from 'react';
import DOMPurify from 'dompurify';
import styles from '../styles/EmailAgent.module.css';

interface EmailBodyContentProps {
    selectedEmailDetail?: Record<string, any> | null;
    fallbackSnippet?: string;
}

export default function EmailBodyContent({ selectedEmailDetail, fallbackSnippet }: EmailBodyContentProps) {
    if (selectedEmailDetail?.bodyText) {
        return <pre className={styles.plainBody}>{selectedEmailDetail.bodyText}</pre>;
    }
    if (selectedEmailDetail?.bodyHtml) {
        return (
            <div
                className={styles.htmlBody}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmailDetail.bodyHtml) }}
            />
        );
    }
    return <p className={styles.fallbackText}>{selectedEmailDetail?.snippet || fallbackSnippet || '-'}</p>;
}
