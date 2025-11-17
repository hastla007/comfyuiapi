import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { PlayCircle, RefreshCcw, Send } from 'lucide-react';
import { API_URL } from '../config';
import extractErrorMessage from '../utils/errorMessage';
import './PlaygroundPage.css';

const SEGMENTS = [
  {
    key: 'text-to-image',
    title: 'Text to Image',
    description: 'Generate images from prompts using a running workflow.',
    fields: ['prompt', 'negative']
  },
  {
    key: 'image-to-image',
    title: 'Image to Image',
    description: 'Transform an input image with guidance from your prompt.',
    fields: ['prompt', 'imageUrl', 'strength']
  },
  {
    key: 'text-to-video',
    title: 'Text to Video',
    description: 'Render short clips from text descriptions via compatible workflows.',
    fields: ['prompt', 'duration']
  },
  {
    key: 'upscale',
    title: 'Upscale',
    description: 'Upscale images with your preferred enhancement workflow.',
    fields: ['imageUrl']
  }
];

const defaultInputState = SEGMENTS.reduce((acc, segment) => {
  acc[segment.key] = {
    prompt: '',
    negative: '',
    imageUrl: '',
    strength: 0.65,
    duration: 6
  };
  return acc;
}, {});

function PlaygroundPage() {
  const [workflows, setWorkflows] = useState([]);
  const [containers, setContainers] = useState([]);
  const [selection, setSelection] = useState({});
  const [inputs, setInputs] = useState(defaultInputState);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const runningWorkflowIds = useMemo(() => {
    const running = new Set();
    containers.forEach((container) => {
      if (container.status?.toLowerCase() === 'running' && container.workflow_id) {
        running.add(container.workflow_id);
      }
    });
    return running;
  }, [containers]);

  const runningContainersByWorkflow = useMemo(() => {
    const map = {};
    containers.forEach((container) => {
      if (container.status?.toLowerCase() === 'running' && container.workflow_id) {
        if (!map[container.workflow_id]) {
          map[container.workflow_id] = [];
        }
        map[container.workflow_id].push(container);
      }
    });
    return map;
  }, [containers]);

  const loadData = async () => {
    try {
      setBusy(true);
      const [wfRes, containerRes] = await Promise.all([
        axios.get(`${API_URL}/workflows`),
        axios.get(`${API_URL}/containers`)
      ]);

      if (wfRes.data.success) {
        setWorkflows(wfRes.data.workflows || []);
      }
      if (containerRes.data.success) {
        setContainers(containerRes.data.containers || []);
      }
      setStatus('');
    } catch (error) {
      setStatus(extractErrorMessage(error, 'Unable to load playground data.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSelectWorkflow = (segmentKey, workflowId) => {
    setSelection((prev) => ({ ...prev, [segmentKey]: workflowId }));
  };

  const handleInputChange = (segmentKey, field, value) => {
    setInputs((prev) => ({
      ...prev,
      [segmentKey]: {
        ...prev[segmentKey],
        [field]: value
      }
    }));
  };

  const buildParameters = (segmentKey) => {
    const input = inputs[segmentKey] || {};
    const params = { mode: segmentKey };

    if (input.prompt) params.prompt = input.prompt;
    if (input.negative) params.negative_prompt = input.negative;
    if (input.imageUrl) params.image_url = input.imageUrl;
    if (input.strength) params.strength = input.strength;
    if (input.duration) params.duration = input.duration;

    return params;
  };

  const handleRun = async (segmentKey) => {
    const workflowId = selection[segmentKey];
    if (!workflowId) {
      setStatus('Select a running workflow before starting a test.');
      return;
    }

    const availableContainers = runningContainersByWorkflow[Number(workflowId)] || [];
    if (availableContainers.length === 0) {
      setStatus('No running container is currently using that workflow.');
      return;
    }

    const apiKey = localStorage.getItem('apiKey');
    const headers = apiKey ? { 'x-api-key': apiKey } : undefined;

    try {
      setBusy(true);
      const parameters = buildParameters(segmentKey);
      const response = await axios.post(
        `${API_URL}/jobs`,
        {
          workflow_id: Number(workflowId),
          container_id: availableContainers[0].id,
          parameters
        },
        { headers }
      );

      if (response.data.success) {
        setStatus(`Job ${response.data.job?.id || ''} submitted to ${availableContainers[0].name || 'container'}.`);
      }
    } catch (error) {
      setStatus(extractErrorMessage(error, 'Failed to run workflow test.'));
    } finally {
      setBusy(false);
    }
  };

  const renderField = (segmentKey, field) => {
    const value = inputs[segmentKey]?.[field] ?? '';
    const handler = (e) => handleInputChange(segmentKey, field, field === 'strength' || field === 'duration' ? Number(e.target.value) : e.target.value);

    switch (field) {
      case 'prompt':
        return (
          <div className="field-group">
            <label htmlFor={`${segmentKey}-prompt`}>Prompt</label>
            <textarea
              id={`${segmentKey}-prompt`}
              value={value}
              onChange={handler}
              placeholder="Describe what you want to generate"
            />
          </div>
        );
      case 'negative':
        return (
          <div className="field-group">
            <label htmlFor={`${segmentKey}-negative`}>Negative Prompt (optional)</label>
            <input
              id={`${segmentKey}-negative`}
              value={value}
              onChange={handler}
              placeholder="Things to avoid in the output"
            />
          </div>
        );
      case 'imageUrl':
        return (
          <div className="field-group">
            <label htmlFor={`${segmentKey}-image`}>Image URL</label>
            <input
              id={`${segmentKey}-image`}
              value={value}
              onChange={handler}
              placeholder="https://example.com/input.png"
            />
          </div>
        );
      case 'strength':
        return (
          <div className="field-group compact">
            <label htmlFor={`${segmentKey}-strength`}>Strength</label>
            <input
              id={`${segmentKey}-strength`}
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={value}
              onChange={handler}
            />
          </div>
        );
      case 'duration':
        return (
          <div className="field-group compact">
            <label htmlFor={`${segmentKey}-duration`}>Duration (seconds)</label>
            <input
              id={`${segmentKey}-duration`}
              type="number"
              min="1"
              max="30"
              value={value}
              onChange={handler}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="playground-page">
      <div className="playground-header">
        <div>
          <h2>Playground</h2>
          <p>Try your workflows by sending quick jobs to running containers.</p>
        </div>
        <div className="playground-actions">
          <button type="button" className="refresh-btn" onClick={loadData} disabled={busy}>
            <RefreshCcw size={16} /> Refresh data
          </button>
          {status && <div className="playground-status" role="status">{status}</div>}
        </div>
      </div>

      <div className="playground-grid">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="playground-card">
            <div className="card-header">
              <div>
                <h3>{segment.title}</h3>
                <p>{segment.description}</p>
              </div>
              <PlayCircle size={24} />
            </div>
            <div className="card-body">
              <label htmlFor={`${segment.key}-workflow`}>Workflow</label>
              <select
                id={`${segment.key}-workflow`}
                value={selection[segment.key] || ''}
                onChange={(e) => handleSelectWorkflow(segment.key, e.target.value)}
              >
                <option value="">Choose a running workflow...</option>
                {workflows.map((workflow) => {
                  const isRunning = runningWorkflowIds.has(workflow.id);
                  return (
                    <option
                      key={workflow.id}
                      value={workflow.id}
                      disabled={!isRunning}
                      className={!isRunning ? 'workflow-disabled' : ''}
                    >
                      {workflow.name} {!isRunning ? '(not running)' : ''}
                    </option>
                  );
                })}
              </select>

              <div className="segment-fields">
                {segment.fields.map((field) => (
                  <React.Fragment key={`${segment.key}-${field}`}>
                    {renderField(segment.key, field)}
                  </React.Fragment>
                ))}
              </div>

              <div className="segment-actions">
                <button type="button" className="play-btn" onClick={() => handleRun(segment.key)} disabled={busy}>
                  <Send size={18} /> Send Job
                </button>
                {selection[segment.key] && !runningWorkflowIds.has(Number(selection[segment.key])) && (
                  <span className="status-hint">Selected workflow is not running.</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlaygroundPage;
