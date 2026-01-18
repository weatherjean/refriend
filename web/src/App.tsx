import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NewPostPage } from './pages/NewPostPage';
import { PostPage } from './pages/PostPage';
import { ActorPage } from './pages/ActorPage';
import { SearchPage } from './pages/SearchPage';
import { TagPage } from './pages/TagPage';
import { useAuth } from './context/AuthContext';

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/new" element={<NewPostPage />} />
        <Route path="/posts/:id" element={<PostPage />} />
        <Route path="/u/:handle/*" element={<ActorPage />} />
        <Route path="/tags/:tag" element={<TagPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
