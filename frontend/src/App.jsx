import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import MdProcessorEntry from './entries/sub1/mdProcessorEntry';
import HomeEntry from './entries/homeEntry'; // 引入 HomeEntry

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>

          {/* 把主页挂载到根路径 */}
          <Route index element={<HomeEntry />} />

          {/* 其他路由 */}
          <Route path="sub1/md-processor" element={<MdProcessorEntry />} />
          <Route path="login" element={<div><h1>Login Page 占位</h1></div>} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;