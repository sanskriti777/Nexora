import React, { useState } from 'react';
import attachmentService from '../../services/attachmentService';
import Button from '../ui/Button';

/**
 * Helper to get an appropriate file emoji/icon based on MIME type or extension
 */
const getFileIcon = (mimeType = '', extension = '') => {
  const mime = mimeType.toLowerCase();
  const ext = extension.toLowerCase();

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return '🖼️';
  }
  if (mime.includes('pdf') || ext === 'pdf') {
    return '📕';
  }
  if (mime.includes('word') || ['doc', 'docx'].includes(ext)) {
    return '📘';
  }
  if (mime.includes('sheet') || mime.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return '📊';
  }
  if (mime.includes('presentation') || ['ppt', 'pptx'].includes(ext)) {
    return '📙';
  }
  if (mime.includes('zip') || mime.includes('compressed') || ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
    return '📦';
  }
  if (mime.includes('text') || ['txt', 'md', 'json', 'xml', 'log'].includes(ext)) {
    return '📝';
  }
  return '📎';
};

/**
 * Format bytes to readable size
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const AttachmentItem = ({ attachment, onDelete, canDelete = true }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await attachmentService.downloadAttachment(attachment.id, attachment.original_name);
    } catch {
      alert('Failed to download file. Please check your permissions or try again later.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${attachment.original_name}"?`)) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await attachmentService.deleteAttachment(attachment.id);
      if (onDelete) {
        onDelete(attachment.id);
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete attachment.');
      setIsDeleting(false);
    }
  };

  const fileIcon = getFileIcon(attachment.mime_type, attachment.extension);
  const fileSizeDisplay = attachment.human_size || formatFileSize(attachment.file_size);
  const uploadDate = attachment.created_at
    ? new Date(attachment.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        marginBottom: '8px',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#CBD5E1';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#E2E8F0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* File Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '24px', flexShrink: 0 }}>{fileIcon}</span>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#0F172A',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={attachment.original_name}
          >
            {attachment.original_name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            <span>{fileSizeDisplay}</span>
            <span>•</span>
            <span>Uploaded by {attachment.user?.name || attachment.uploader_name || 'User'}</span>
            {uploadDate && (
              <>
                <span>•</span>
                <span>{uploadDate}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
        {deleteError && (
          <span style={{ fontSize: '12px', color: '#DC2626' }}>{deleteError}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          isLoading={isDownloading}
          disabled={isDownloading || isDeleting}
          title="Download file"
        >
          ⬇️ Download
        </Button>
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
            disabled={isDownloading || isDeleting}
            title="Delete file"
            style={{ color: '#DC2626', borderColor: '#FECACA' }}
          >
            🗑️
          </Button>
        )}
      </div>
    </div>
  );
};

export default AttachmentItem;
