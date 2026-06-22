'use client'

import React, { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Paperclip, Plus, X } from 'lucide-react'
import { notify } from '@/components/ui/sonner'
import styles from './SupportingDoc.module.css'

interface SupportingDocProps {
    files: File[]
    onFilesChange: (files: File[]) => void
    accept?: string
    multiple?: boolean
}

const MAX_SUPPORTED_FILES = 8

const PDF_TYPES = ['.pdf']
const TEXT_TYPES = ['.txt']
const WORD_TYPES = ['.doc', '.docx', '.docm', '.odt', '.rtf']
const POWERPOINT_TYPES = ['.ppt', '.pptx', '.pptm', '.odp']
const SPREADSHEET_TYPES = ['.xls', '.xlsx', '.xlsm', '.ods', '.csv', '.tsv']
const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']

const ALLOWED_MIME_PREFIXES: string[] = []
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/csv',
    'text/tab-separated-values',
    'text/tsv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroenabled.12',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'text/rtf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint.presentation.macroenabled.12',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp',
]
const ALLOWED_EXTENSIONS = [
    ...PDF_TYPES,
    ...TEXT_TYPES,
    ...WORD_TYPES,
    ...POWERPOINT_TYPES,
    ...SPREADSHEET_TYPES,
    ...IMAGE_TYPES,
]
const ACCEPT_DEFAULT = [...ALLOWED_MIME_TYPES, ...ALLOWED_EXTENSIONS].join(',')

const SupportingDoc = ({
    files,
    onFilesChange,
    accept = ACCEPT_DEFAULT,
    multiple = true,
}: SupportingDocProps) => {
    const [isDragging, setIsDragging] = useState(false)
    const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([])

    const hasFiles = files.length > 0

    const filteredFiles = useMemo(() => {
        return files.filter(isAllowedFile)
    }, [files])

    useEffect(() => {
        const urls = filteredFiles.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null))
        setPreviewUrls(urls)

        return () => {
            urls.forEach((url) => {
                if (url) URL.revokeObjectURL(url)
            })
        }
    }, [filteredFiles])

    const handleValidate = (filesToReview: File[]) => {
        const disallowed = filesToReview.filter((file) => !isAllowedFile(file))
        if (disallowed.length > 0) {
            notify.error('Some files are not supported', 'Supported: Word, PowerPoint, spreadsheets, PDF/TXT, and image files.')
        }
    }

    const applyFileLimit = (candidateFiles: File[]) => {
        if (candidateFiles.length <= MAX_SUPPORTED_FILES) {
            return candidateFiles
        }

        notify.warning('Maximum file limit reached', `You can upload up to ${MAX_SUPPORTED_FILES} documents only.`)

        return candidateFiles.slice(0, MAX_SUPPORTED_FILES)
    }

    const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files ?? [])
        if (selectedFiles.length === 0) return

        const nextFiles = multiple ? [...files, ...selectedFiles] : [selectedFiles[0]]
        const allowedFiles = applyFileLimit(nextFiles.filter(isAllowedFile))

        onFilesChange(allowedFiles)
        handleValidate(nextFiles)
        if (allowedFiles.length > files.length) {
            notify.success('Files selected', `${allowedFiles.length - files.length} file(s) have been added.`)
        }
        e.currentTarget.value = ''
    }

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFiles = Array.from(e.dataTransfer.files ?? [])
        if (droppedFiles.length === 0) return

        const nextFiles = multiple ? [...files, ...droppedFiles] : [droppedFiles[0]]
        const allowedFiles = applyFileLimit(nextFiles.filter(isAllowedFile))

        onFilesChange(allowedFiles)
        handleValidate(nextFiles)
        if (allowedFiles.length > files.length) {
            notify.success('Files selected', `${allowedFiles.length - files.length} file(s) have been added.`)
        }
    }

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleRemoveFileAt = (index: number) => {
        const nextFiles = filteredFiles.filter((_, i) => i !== index)
        onFilesChange(nextFiles)
    }

    const handleClearFiles = () => {
        if (!hasFiles) return
        onFilesChange([])
    }

    return (
        <div className={styles.root} data-testid="attachments-uploader">
            <div className={styles.metaRow}>
                <div className={styles.metaInfo}>
                    <p className={styles.metaText}>
                        {hasFiles
                            ? `${filteredFiles.length} attachment${filteredFiles.length > 1 ? 's' : ''} ready`
                            : 'Optional supporting materials'}
                    </p>
                    <span className={styles.limitChip}>Up to {MAX_SUPPORTED_FILES} files</span>
                </div>
                {hasFiles && <button
                    type="button"
                    onClick={handleClearFiles}
                    disabled={!hasFiles}
                    className={styles.clearButton}
                    data-testid="attachments-clear-button"
                    aria-disabled={!hasFiles}
                >
                    Clear all
                </button>}
            </div>

            <label
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    className="hidden"
                    onChange={handleFilesSelected}
                    accept={accept}
                    multiple={multiple}
                    data-testid="file-upload-input"
                />
                <div className={styles.dropInner}>
                    <div className={styles.dropIconOuter}>
                        <div className={styles.dropIconInner}>
                            <Plus className='h-4 w-4' />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className={styles.dropTitle}>Drop files here or click to browse</p>
                        <p className={styles.dropHint}>
                            Add syllabi, notes, PDFs, spreadsheets, screenshots, or existing decks to ground the presentation before generation.
                        </p>
                    </div>
                    <div className={styles.typeList} aria-hidden="true">
                        <span className={styles.typeChip}>Docs</span>
                        <span className={styles.typeChip}>Slides</span>
                        <span className={styles.typeChip}>Sheets</span>
                        <span className={styles.typeChip}>Images</span>
                    </div>
                </div>
            </label>

            {hasFiles && (
                <div className="mt-1">
                    <ul data-testid="file-list" className={styles.fileList} aria-label="Attached files">
                        {filteredFiles.map((file, idx) => (
                            <li
                                key={`${file.name}-${idx}`}
                                className={styles.fileItem}
                                data-testid="attached-file-item"
                            >
                                {previewUrls[idx] ? (
                                    <img src={previewUrls[idx] as string} alt="Preview" className={styles.previewImage} />
                                ) : (
                                    <div className={styles.previewFallback}>
                                        <Paperclip className="h-4 w-4" />
                                    </div>
                                )}

                                <div className={styles.fileBody}>
                                    <p className={`${styles.fileName} truncate`} title={file.name}>
                                        {file.name}
                                    </p>
                                    <p className={styles.fileMeta}>{formatFileSize(file.size)}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleRemoveFileAt(idx)}
                                    className={styles.removeButton}
                                    aria-label={`Remove ${file.name}`}
                                    data-testid="remove-file-button"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    {filteredFiles.length !== files.length && (
                        <p className={styles.warning}>
                            Some files were skipped. Supported: Word, PowerPoint, spreadsheets, PDF/TXT, and image files.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB'
    return `${(bytes / 1024).toFixed(1)} KB`
}

function isAllowedFile(file: File): boolean {
    const type = (file.type || '').toLowerCase()
    const name = (file.name || '').toLowerCase()
    const typeAllowed = ALLOWED_MIME_TYPES.includes(type) || ALLOWED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix))

    if (typeAllowed) return true
    return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export default SupportingDoc
