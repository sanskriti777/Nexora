import apiClient from './api';

/**
 * Attachments API Service
 *
 * Provides real, authenticated HTTP methods for the NEXORA Files & Attachments module.
 */
export const attachmentService = {
  /**
   * Fetch list of attachments for a specific entity
   *
   * @param {Object} params - { attachable_type, attachable_id }
   */
  async listAttachments(params = {}) {
    const response = await apiClient.get('/attachments', { params });
    return response.data;
  },

  /**
   * Upload an attachment
   *
   * @param {FormData} formData - Must contain 'file', 'attachable_type', 'attachable_id'
   * @param {Function} [onUploadProgress] - Optional progress callback
   */
  async uploadAttachment(formData, onUploadProgress = null) {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    };
    if (typeof onUploadProgress === 'function') {
      config.onUploadProgress = onUploadProgress;
    }
    const response = await apiClient.post('/attachments', formData, config);
    return response.data;
  },

  /**
   * Get metadata for a specific attachment
   *
   * @param {string|number} attachmentId
   */
  async getAttachment(attachmentId) {
    const response = await apiClient.get(`/attachments/${attachmentId}`);
    return response.data;
  },

  /**
   * Download an attachment as a binary blob and trigger browser download
   *
   * @param {string|number} attachmentId
   * @param {string} [originalFilename]
   */
  async downloadAttachment(attachmentId, originalFilename) {
    const response = await apiClient.get(`/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: response.headers['content-type'] || 'application/octet-stream',
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', originalFilename || 'download');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },

  /**
   * Delete an attachment
   *
   * @param {string|number} attachmentId
   */
  async deleteAttachment(attachmentId) {
    const response = await apiClient.delete(`/attachments/${attachmentId}`);
    return response.data;
  },
};

export default attachmentService;
