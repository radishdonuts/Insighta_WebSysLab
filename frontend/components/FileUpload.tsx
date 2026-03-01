"use client";

import React, { useState, useCallback, useRef } from "react";
import styles from "./FileUpload.module.css";

// Icons 
const UploadCloudIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.uploadIcon} aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.fileTypeIcon} aria-hidden>
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <polyline points="13 2 13 9 20 9" />
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

// Format file size helper
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export interface FileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  // Optional progress per file index
  uploadProgress?: Record<number, number>; 
}

export function FileUpload({ files, onChange, uploadProgress = {} }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave" || e.type === "drop") {
      setDragActive(false);
    }
  }, []);

  const validateAndAddFiles = useCallback((newFiles: File[]) => {
    setError(null);
    let validFiles: File[] = [];
    let _error: string | null = null;
    
    for (const file of newFiles) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        _error = `File type not supported: ${file.name}`;
      } else if (file.size > MAX_FILE_SIZE) {
        _error = `File too large (max 10MB): ${file.name}`;
      } else {
        // exclude duplicates by name and size
        const isDuplicate = files.some(f => f.name === file.name && f.size === file.size);
        if (!isDuplicate) {
          validFiles.push(file);
        }
      }
    }

    if (_error) {
      setError(_error);
      return; 
    }

    const merged = [...files, ...validFiles];
    if (merged.length > MAX_FILES) {
      setError(`You can only upload up to ${MAX_FILES} files.`);
      return;
    }

    onChange(merged);
  }, [files, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(Array.from(e.dataTransfer.files));
    }
  }, [validateAndAddFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(Array.from(e.target.files));
    }
    // reset input
    e.target.value = '';
  }, [validateAndAddFiles]);

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onChange(updated);
    if (error) setError(null); // Clear errors on remove
  };

  return (
    <div className={styles.uploadWrapper}>
      <div 
        className={`${styles.dropZone} ${dragActive ? styles.dragActive : ""}`} 
        onDragEnter={handleDrag} 
        onDragLeave={handleDrag} 
        onDragOver={handleDrag} 
        onDrop={handleDrop}
      >
        <UploadCloudIcon />
        <p className={styles.dropText}>Drag and drop files here or click to browse</p>
        <p className={styles.dropSubtext}>Supported: .pdf, .jpg, .png, .doc. Max 10MB per file.</p>
        
        <input 
          type="file" 
          multiple 
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleChange}
          className={styles.fileInput}
          aria-label="Upload files"
        />
      </div>

      {error && (
        <div className={styles.errorText} role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <ul className={styles.fileList} aria-label="Selected files">
          {files.map((file, idx) => (
            <li key={`${file.name}-${file.size}-${idx}`} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <FileIcon />
                <div className={styles.fileDetails}>
                  <span className={styles.fileName} title={file.name}>{file.name}</span>
                  <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                  { uploadProgress[idx] !== undefined && (
                    <div className={styles.progressContainer} aria-hidden>
                       <div className={styles.progressBar} style={{ width: `${uploadProgress[idx]}%` }} />
                    </div>
                  )}
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => removeFile(idx)} 
                className={styles.removeButton}
                aria-label={`Remove file ${file.name}`}
                title="Remove file"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
