import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import MdProcessorEntry from './entries/sub1/mdProcessorEntry';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 外层套上 Layout，所有子路由都会拥有顶栏和底栏 */}
        <Route path="/" element={<Layout />}>

          {/* 这里相当于原来的 /sub1/md_processor 页面 */}
          <Route path="sub1/md-processor" element={<MdProcessorEntry />} />

          {/* 以后你的首页就加在这里 */}
          <Route path="" element={<div><h1>Home Page 占位</h1></div>} />

          {/* 以后你的登录页加在这里 */}
          <Route path="login" element={<div><h1>Login Page 占位</h1></div>} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;