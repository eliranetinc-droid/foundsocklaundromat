module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist/client',
      url: [
        'http://localhost/index.html',
        'http://localhost/pricing/index.html',
        'http://localhost/visit/index.html',
        'http://localhost/blog/index.html',
      ],
      settings: { preset: 'desktop' },
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 1.0 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
