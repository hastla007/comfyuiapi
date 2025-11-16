import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw, Download, Trash2, File, Image, Video, Folder } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL } from '../config';
import './FilesPage.css';

function FilesPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid or list

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/media`);
      if (response.data.success) {
        setFiles(response.data.files || []);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (filename) => {
    if (window.confirm(`Delete ${filename}?`)) {
      try {
        await axios.delete(`${API_URL}/media/${filename}`);
        fetchFiles();
        if (selectedFile?.name === filename) {
          setSelectedFile(null);
        }
      } catch (error) {
        console.error('Error deleting file:', error);
        alert('Failed to delete file');
      }
    }
  };

  const downloadFile = (filename) => {
    window.open(`${API_URL}/media/${filename}`, '_blank');
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('image')) return <Image size={24} />;
    if (type?.startsWith('video')) return <Video size={24} />;
    return <File size={24} />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getThumbnail = (file) => {
    if (file.type?.startsWith('image')) {
      return `${API_URL}/media/${file.name}`;
    }
    return null;
  };

  return (
    <div className="files-page">
      <div className="files-header">
        <h2>Media Files</h2>
        <div className="files-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
          <button onClick={fetchFiles} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading files...</div>
      ) : files.length === 0 ? (
        <div className="no-files">
          <Folder size={48} />
          <p>No files found</p>
        </div>
      ) : (
        <div className={`files-container ${viewMode}`}>
          {viewMode === 'grid' ? (
            <div className="files-grid">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="file-card"
                  onClick={() => setSelectedFile(file)}
                >
                  <div className="file-preview">
                    {getThumbnail(file) ? (
                      <img src={getThumbnail(file)} alt={file.name} />
                    ) : (
                      <div className="file-icon">
                        {getFileIcon(file.type)}
                      </div>
                    )}
                  </div>
                  <div className="file-info">
                    <div className="file-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="file-size">{formatFileSize(file.size)}</div>
                  </div>
                  <div className="file-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(file.name);
                      }}
                      className="btn-action"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(file.name);
                      }}
                      className="btn-action btn-danger"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="files-list">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.name}>
                      <td className="file-name-cell">
                        <div className="file-name-wrapper">
                          {getFileIcon(file.type)}
                          <span>{file.name}</span>
                        </div>
                      </td>
                      <td>{file.type || 'Unknown'}</td>
                      <td>{formatFileSize(file.size)}</td>
                      <td>
                        {file.modified
                          ? format(new Date(file.modified), 'MMM dd, yyyy HH:mm')
                          : 'N/A'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => downloadFile(file.name)}
                            className="btn-action"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => deleteFile(file.name)}
                            className="btn-action btn-danger"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedFile && viewMode === 'grid' && (
        <div className="file-preview-modal" onClick={() => setSelectedFile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedFile(null)}>
              ×
            </button>
            <h3>{selectedFile.name}</h3>
            {getThumbnail(selectedFile) && (
              <img src={getThumbnail(selectedFile)} alt={selectedFile.name} />
            )}
            <div className="file-details">
              <p><strong>Type:</strong> {selectedFile.type || 'Unknown'}</p>
              <p><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
              <p>
                <strong>Modified:</strong>{' '}
                {selectedFile.modified
                  ? format(new Date(selectedFile.modified), 'MMM dd, yyyy HH:mm:ss')
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="files-footer">
        <span>Total: {files.length} files</span>
        <span>
          Total size: {formatFileSize(files.reduce((acc, f) => acc + (f.size || 0), 0))}
        </span>
      </div>
    </div>
  );
}

export default FilesPage;
