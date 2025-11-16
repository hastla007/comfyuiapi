describe('ComfyUI Manager E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should load the application', () => {
    cy.contains('ComfyUI Manager').should('be.visible');
  });

  it('should navigate to different pages', () => {
    // Navigate to Containers
    cy.contains('Containers').click();
    cy.url().should('include', '/containers');

    // Navigate to Workflows
    cy.contains('Workflows').click();
    cy.url().should('include', '/workflows');

    // Navigate to Logs
    cy.contains('Logs').click();
    cy.url().should('include', '/logs');

    // Navigate to Queue
    cy.contains('Queue').click();
    cy.url().should('include', '/queue');

    // Navigate to Jobs
    cy.contains('Jobs').click();
    cy.url().should('include', '/jobs');

    // Navigate to System Info
    cy.contains('System Info').click();
    cy.url().should('include', '/system');

    // Navigate to Settings
    cy.contains('Settings').click();
    cy.url().should('include', '/settings');
  });

  it('should display navigation menu', () => {
    cy.get('.layout-nav').should('exist');
    cy.get('.nav-item').should('have.length.at.least', 8);
  });

  it('should have active navigation state', () => {
    cy.contains('Containers').click();
    cy.contains('Containers').should('have.class', 'active');
  });
});

describe('Health Check API', () => {
  it('should return healthy status', () => {
    cy.request('http://localhost:3000/health').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('status');
    });
  });
});
