import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PlayCircle } from 'lucide-react';
import { API_URL } from '../config';
import './PlaygroundPage.css';

const DEFAULT_TYPES = {
  checkpoints: 'Text-to-Image',
  loras: 'LoRA',
  upscale: 'Upscaler',
  vae: 'VAE',
  clip: 'Clip Encoder'
};

function PlaygroundPage() {
  const [models, setModels] = useState({});
  const [selection, setSelection] = useState({});
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get(`${API_URL}/models`);
        if (response.data.success) {
          setModels(response.data.models || {});
        }
      } catch (error) {
        setStatus('Unable to load models. Make sure the models directory is mounted.');
      }
    };

    fetchModels();
  }, []);

  const handleSelect = (type, value) => {
    setSelection(prev => ({ ...prev, [type]: value }));
  };

  const handleTest = (type) => {
    const modelName = selection[type];
    if (!modelName) {
      setStatus('Please select a model to test.');
      return;
    }
    setStatus(`Prepared ${DEFAULT_TYPES[type] || type} test for ${modelName}${prompt ? ` with prompt: ${prompt}` : ''}.`);
  };

  return (
    <div className="playground-page">
      <div className="playground-header">
        <div>
          <h2>Playground</h2>
          <p>Select models and craft quick test prompts.</p>
        </div>
        <div className="prompt-box">
          <label htmlFor="playground-prompt">Test Prompt</label>
          <textarea
            id="playground-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a sample prompt to reuse across model tests"
          />
        </div>
      </div>

      {status && <div className="playground-status">{status}</div>}

      <div className="playground-grid">
        {Object.entries(DEFAULT_TYPES).map(([key, label]) => (
          <div key={key} className="playground-card">
            <div className="card-header">
              <div>
                <h3>{label}</h3>
                <p>Select a {label} model and run a quick smoke test.</p>
              </div>
              <PlayCircle size={24} />
            </div>
            <div className="card-body">
              <label htmlFor={`${key}-select`}>Model</label>
              <select
                id={`${key}-select`}
                value={selection[key] || ''}
                onChange={(e) => handleSelect(key, e.target.value)}
              >
                <option value="">Choose a model...</option>
                {(models[key] || []).map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              <button className="play-btn" type="button" onClick={() => handleTest(key)}>
                <PlayCircle size={18} /> Test Model
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlaygroundPage;
