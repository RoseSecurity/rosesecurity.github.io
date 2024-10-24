import React from 'react';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import '../css/landing-page.css';

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;

  return (
    <div className="landing-page">
      <Layout title={`Welcome to ${siteConfig.title}`} description="A blog about development, security, and other nerdy things.">
        <header className="hero hero--full-height">
          <div className="intro">
            <h1>My Code & Cloud Chronicles</h1>
            <img 
              src="/img/rosesecurity.gif" 
              alt="RoseSecurity GIF" 
              style={{ width: '70%', height: 'auto', marginTop: '20px' }} 
            />
          </div>
          <div className="hero__cta" style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
            <Link to="/blog" className="button button--lg button--primary">
              <p>Read the Blog</p>
            </Link>
            <Link to="https://www.linkedin.com/in/rosesecurity/" className="button button--lg button--primary">
              <p>Connect with Me</p>
            </Link>
          </div>
        </header>
      </Layout>
    </div>
  );
}

export default Home;

