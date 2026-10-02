import React, { useState, useRef } from 'react';
import attachmentService from '../../services/attachmentService';
import Button from '../ui/Button';

/**
 * AttachmentUploader Component
 *
 * Provides drag-and-drop & file browser input, upload progress,
 * file size validation, and safe error handling.
 */
export const AttachmentUploader = ({
  attachableType,
  attachableId,
  onUploadSuccess,
  disabled = false,
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // 20MB limit (20 * 1024 * 1024 bytes)
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const BLOCKED_EXTENSIONS = ['php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'sh', 'bash', 'bin', 'msi', 'com', 'scr', 'vbs', 'ps1'];

  const validateFile = (file) => {
    if (!file) return 'Please select a file to upload.';

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
      return `File type ".${ext}" is not permitted for security reasons.`;
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 20MB.`;
    }

    return null;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !attachableType || !attachableId) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('attachable_type', attachableType);
    formData.append('attachable_id', attachableId);

    try {
      const response = await attachmentService.uploadAttachment(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onUploadSuccess && response.data) {
        onUploadSuccess(response.data);
      }
    } catch (err) {
      const msg =
        err.errors?.file?.[0] ||
        err.message ||
        'Failed to upload file. Please check your connection and try again.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCancelSelection = () => {
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `2px dashed ${isDragOver ? '#2563EB' : '#CBD5E1'}`,
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        transition: 'all 0.2s ease',
        backgroundColor: isDragOver ? '#EFF6FF' : '#FAFAFA',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled || isUploading}
        id="attachment-file-input"
      />

      {errorMessage && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '13px',
            marginBottom: '14px',
            textAlign: 'left',
          }}
        >
          <strong>Upload Error:</strong> {errorMessage}
        </div>
      )}

      {!selectedFile ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              fontSize: '20px',
            }}
          >
            📎
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#1E293B' }}>
              Drag and drop files here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: 0,
                  fontSize: '14px',
                }}
              >
                browse
              </button>
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
              Documents, images, PDFs, spreadsheets, archives up to 20MB
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F1F5F9',
              padding: '10px 14px',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', overflow: 'hidden' }}>
              <span style={{ fontSize: '20px' }}>📄</span>
              <div style={{ overflow: 'hidden' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0F172A',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '320px',
                  }}
                  title={selectedFile.name}
                >
                  {selectedFile.name}
                </p>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  {formatFileSize(selectedFile.size)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isUploading && (
                <button
                  type="button"
                  onClick={handleCancelSelection}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: '4px 8px',
                  }}
                >
                  Cancel
                </button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpload}
                isLoading={isUploading}
                disabled={isUploading}
              >
                {isUploading ? `Uploading ${uploadProgress}%` : 'Upload File'}
              </Button>
            </div>
          </div>

          {isUploading && (
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#E2E8F0',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: '#2563EB',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttachmentUploader;
