// frontend/src/api/client.js
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:5009/api',
  withCredentials: true,
});

export default client;