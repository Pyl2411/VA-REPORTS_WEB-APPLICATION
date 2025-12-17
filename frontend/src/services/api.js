// frontend/src/services/api.js
import axios from 'axios';

// This will be https://your-backend-api.com in production
// or http://localhost:5000 in development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
// Instead of hardcoded URLs, use:
const API_URL = import.meta.env.VITE_API_URL || ''

// In your API service files
axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;