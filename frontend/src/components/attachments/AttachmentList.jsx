import React, { useState, useEffect, useCallback } from 'react';
import attachmentService from '../../services/attachmentService';
import AttachmentUploader from './AttachmentUploader';
import AttachmentItem from './AttachmentItem';
import Button from '../ui/Button';

/**
 * AttachmentList Component
 *
 * Manages fetching, uploading, listing, downloading, and deleting attachments
 * for any supported attachable entity (e.g., project, task).
 */
export const AttachmentList = ({
  attachableType,
  attachableId,
  canUpload = true,
  canDelete = true,
}) => {
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(attachableType && attachableId));
  const [errorMessage, setErrorMessage] = useState(null);
  const [showUploader, setShowUploader] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchAttachments = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!attachableType || !attachableId) {
      return;
    }

    let isMounted = true;

    async function load() {
      try {
        const response = await attachmentService.listAttachments({
          attachable_type: attachableType,
          attachable_id: attachableId,
        });

        if (isMounted) {
          setAttachments(response?.data || []);
          setErrorMessage(null);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err.message || 'Failed to load attachments.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [attachableType, attachableId, refreshTrigger]);

  const handleUploadSuccess = (newAttachment) => {
    setAttachments((prev) => [newAttachment, ...prev]);
    setShowUploader(false);
  };

  const handleDeleteSuccess = (attachmentId) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  return (
    <div className="attachments-module" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
            Attachments ({attachments.length})
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>
            Files and documents attached to this {attachableType}.
          </p>
        </div>

        {canUpload && (
          <Button
            variant={showUploader ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setShowUploader((prev) => !prev)}
          >
            {showUploader ? '✕ Close' : '+ Upload File'}
          </Button>
        )}
      </div>

      {/* Uploader Section */}
      {showUploader && canUpload && (
        <AttachmentUploader
          attachableType={attachableType}
          attachableId={attachableId}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Error State */}
      {errorMessage && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '13px', color: '#991B1B' }}>{errorMessage}</span>
          <Button variant="outline" size="sm" onClick={fetchAttachments}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div
          style={{
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#64748B',
          }}
        >
          <div className="loading-spinner" />
          <span style={{ fontSize: '13px' }}>Loading attachments...</span>
        </div>
      )}

      {/* Attachment List */}
      {!isLoading && attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              onDelete={handleDeleteSuccess}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && attachments.length === 0 && !errorMessage && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: '#F8FAFC',
            borderRadius: '8px',
            border: '1px dashed #E2E8F0',
          }}
        >
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📂</span>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
            No attachments yet
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>
            Upload design assets, documentation, specs, or logs to keep everyone aligned.
          </p>
          {canUpload && !showUploader && (
            <div style={{ marginTop: '14px' }}>
              <Button variant="outline" size="sm" onClick={() => setShowUploader(true)}>
                Upload First File
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttachmentList;
