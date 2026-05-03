import { Injectable } from '@nestjs/common'
import { CreateAppBuilderWorkflowDto } from './app-builder-workflow.dto'
import { APP_BUILDER_WORKFLOW_SYSTEM_PROMPT } from './app-builder-workflow.prompt'
import type {
  AgentRoleAssignment,
  AppAgentRole,
  AppBuilderIntent,
  AppBuilderPlan,
  AppFeature,
  ApiRoute,
  DatabaseTable,
  DeploymentStep,
  TechStack,
  UiPage,
} from './app-builder-workflow.types'

@Injectable()
export class AppBuilderWorkflowService {
  createPlan(input: CreateAppBuilderWorkflowDto): AppBuilderPlan {
    const lower = input.prompt.toLowerCase()

    const intent = input.intent ?? this.detectIntent(lower)
    const techStack = input.preferredStack?.length ? input.preferredStack : this.defaultStack(intent)
    const features = this.buildFeatures(intent, input)
    const databaseSchema = this.buildDatabaseSchema(intent, input)
    const apiRoutes = this.buildApiRoutes(intent, input)
    const uiPages = this.buildUiPages(intent, input)
    const deploymentPlan = this.buildDeploymentPlan(intent, techStack)
    const agentRoles = this.buildAgentRoles()

    return {
      intent,
      title: `${input.appName ?? 'Your App'} Build Plan`,
      summary: this.buildSummary(intent, techStack, features.length),
      techStack,
      features,
      databaseSchema,
      apiRoutes,
      uiPages,
      deploymentPlan,
      agentRoles,
      finalDeliverables: this.buildDeliverables(intent),
      missingInputs: this.findMissingInputs(intent, input),
    }
  }

  getSystemPrompt() {
    return {
      name: 'OpenAgents App Builder Workflow Agent',
      prompt: APP_BUILDER_WORKFLOW_SYSTEM_PROMPT,
    }
  }

  getCapabilities() {
    return {
      intents: ['web_app', 'mobile_app', 'saas', 'landing_page', 'api_backend', 'dashboard', 'ecommerce', 'portfolio', 'blog'],
      stacks: ['nextjs', 'react', 'nestjs', 'express', 'fastapi', 'flutter', 'react_native', 'prisma', 'postgresql', 'supabase'],
      roles: ['product_manager', 'frontend_engineer', 'backend_engineer', 'database_architect', 'qa_tester', 'deployment_engineer'],
    }
  }

  private detectIntent(lower: string): AppBuilderIntent {
    if (lower.includes('saas') || lower.includes('subscription') || lower.includes('platform')) return 'saas'
    if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android') || lower.includes('app store')) return 'mobile_app'
    if (lower.includes('landing page') || lower.includes('landing')) return 'landing_page'
    if (lower.includes('api') || lower.includes('backend') || lower.includes('server')) return 'api_backend'
    if (lower.includes('dashboard') || lower.includes('admin') || lower.includes('panel')) return 'dashboard'
    if (lower.includes('ecommerce') || lower.includes('store') || lower.includes('shop') || lower.includes('sell')) return 'ecommerce'
    if (lower.includes('portfolio') || lower.includes('showcase')) return 'portfolio'
    if (lower.includes('blog') || lower.includes('content') || lower.includes('article')) return 'blog'
    if (lower.includes('web') || lower.includes('website') || lower.includes('app')) return 'web_app'
    return 'unknown'
  }

  private defaultStack(intent: AppBuilderIntent): TechStack[] {
    const base: TechStack[] = ['typescript', 'tailwindcss']
    if (intent === 'landing_page') return [...base, 'nextjs', 'vercel']
    if (intent === 'mobile_app') return ['typescript', 'react_native', 'supabase']
    if (intent === 'api_backend') return ['typescript', 'nestjs', 'prisma', 'postgresql', 'railway']
    if (intent === 'saas') return [...base, 'nextjs', 'nestjs', 'prisma', 'postgresql', 'vercel', 'railway']
    if (intent === 'ecommerce') return [...base, 'nextjs', 'prisma', 'postgresql', 'vercel']
    return [...base, 'nextjs', 'nestjs', 'prisma', 'postgresql', 'vercel']
  }

  private buildFeatures(intent: AppBuilderIntent, input: CreateAppBuilderWorkflowDto): AppFeature[] {
    const features: AppFeature[] = []

    const add = (name: string, desc: string, priority: AppFeature['priority'], role: AppAgentRole, hours: number) => {
      features.push({ name, description: desc, priority, agentRole: role, estimatedHours: hours })
    }

    if (input.needsAuth !== false) {
      add('User registration', 'Email/password and OAuth sign-up', 'must_have', 'backend_engineer', 4)
      add('User login', 'JWT session management with refresh tokens', 'must_have', 'backend_engineer', 3)
      add('Password reset', 'Email-based password reset flow', 'must_have', 'backend_engineer', 2)
    }

    if (input.needsPayments) {
      add('Stripe integration', 'Subscription billing and one-time payments', 'must_have', 'backend_engineer', 6)
      add('Pricing page', 'Plan selection with upgrade/downgrade', 'must_have', 'frontend_engineer', 4)
      add('Billing portal', 'Customer can manage subscription', 'should_have', 'frontend_engineer', 3)
    }

    if (input.needsAdminPanel) {
      add('Admin dashboard', 'User management and system overview', 'should_have', 'frontend_engineer', 6)
      add('Data tables', 'Sortable, filterable data views', 'should_have', 'frontend_engineer', 4)
      add('Role management', 'Admin/user role system', 'should_have', 'backend_engineer', 3)
    }

    if (intent === 'saas' || intent === 'web_app') {
      add('Dashboard home', 'Main app overview with key metrics', 'must_have', 'frontend_engineer', 5)
      add('Settings page', 'Profile, notifications, account settings', 'must_have', 'frontend_engineer', 3)
      add('API key management', 'Generate and revoke API keys', 'nice_to_have', 'backend_engineer', 3)
    }

    if (intent === 'ecommerce') {
      add('Product catalog', 'Browsable product listings with filters', 'must_have', 'frontend_engineer', 6)
      add('Shopping cart', 'Add/remove items with quantity control', 'must_have', 'frontend_engineer', 4)
      add('Checkout flow', 'Shipping, payment, confirmation', 'must_have', 'frontend_engineer', 6)
      add('Order management', 'Order history and tracking', 'must_have', 'backend_engineer', 4)
      add('Inventory system', 'Stock levels and alerts', 'should_have', 'backend_engineer', 4)
    }

    if (intent === 'landing_page') {
      add('Hero section', 'Main value proposition with CTA', 'must_have', 'frontend_engineer', 2)
      add('Features section', 'Key product benefits', 'must_have', 'frontend_engineer', 2)
      add('Pricing section', 'Tiered pricing comparison', 'must_have', 'frontend_engineer', 2)
      add('Contact form', 'Lead capture with email notification', 'must_have', 'frontend_engineer', 2)
      add('SEO metadata', 'Title, description, OG tags', 'must_have', 'frontend_engineer', 1)
    }

    if (input.features?.length) {
      for (const f of input.features) {
        add(f, `User-requested: ${f}`, 'must_have', 'frontend_engineer', 4)
      }
    }

    return features
  }

  private buildDatabaseSchema(intent: AppBuilderIntent, input: CreateAppBuilderWorkflowDto): DatabaseTable[] {
    const tables: DatabaseTable[] = []

    if (input.needsAuth !== false) {
      tables.push({
        name: 'users',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true, description: 'Primary key' },
          { name: 'email', type: 'string', required: true, unique: true, description: 'User email address' },
          { name: 'passwordHash', type: 'string', required: false, description: 'Hashed password (null for OAuth)' },
          { name: 'name', type: 'string', required: true, description: 'Display name' },
          { name: 'role', type: 'enum(user,admin)', required: true, description: 'User role' },
          { name: 'createdAt', type: 'datetime', required: true, description: 'Registration timestamp' },
        ],
        relations: ['sessions', 'subscriptions'],
      })
    }

    if (intent === 'saas' || intent === 'web_app' || intent === 'dashboard') {
      tables.push({
        name: 'workspaces',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true, description: 'Primary key' },
          { name: 'name', type: 'string', required: true, description: 'Workspace name' },
          { name: 'ownerId', type: 'uuid', required: true, description: 'FK to users' },
          { name: 'plan', type: 'enum(free,pro,enterprise)', required: true, description: 'Subscription plan' },
          { name: 'createdAt', type: 'datetime', required: true, description: 'Creation timestamp' },
        ],
        relations: ['users', 'subscriptions'],
      })
    }

    if (intent === 'ecommerce') {
      tables.push({
        name: 'products',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true, description: 'Primary key' },
          { name: 'name', type: 'string', required: true, description: 'Product name' },
          { name: 'description', type: 'text', required: true, description: 'Product description' },
          { name: 'price', type: 'decimal', required: true, description: 'Price in cents' },
          { name: 'stock', type: 'integer', required: true, description: 'Available inventory' },
          { name: 'imageUrl', type: 'string', required: false, description: 'Product image URL' },
        ],
        relations: ['orders', 'categories'],
      })
      tables.push({
        name: 'orders',
        fields: [
          { name: 'id', type: 'uuid', required: true, unique: true, description: 'Primary key' },
          { name: 'userId', type: 'uuid', required: true, description: 'FK to users' },
          { name: 'status', type: 'enum(pending,paid,shipped,delivered,cancelled)', required: true, description: 'Order status' },
          { name: 'totalCents', type: 'integer', required: true, description: 'Total in cents' },
          { name: 'createdAt', type: 'datetime', required: true, description: 'Order timestamp' },
        ],
        relations: ['users', 'order_items'],
      })
    }

    return tables
  }

  private buildApiRoutes(intent: AppBuilderIntent, input: CreateAppBuilderWorkflowDto): ApiRoute[] {
    const routes: ApiRoute[] = []

    if (input.needsAuth !== false) {
      routes.push({ method: 'POST', path: '/auth/register', description: 'Register new user', auth: false, agentRole: 'backend_engineer' })
      routes.push({ method: 'POST', path: '/auth/login', description: 'Login and get JWT', auth: false, agentRole: 'backend_engineer' })
      routes.push({ method: 'POST', path: '/auth/logout', description: 'Invalidate session', auth: true, agentRole: 'backend_engineer' })
      routes.push({ method: 'GET', path: '/auth/me', description: 'Get current user profile', auth: true, agentRole: 'backend_engineer' })
    }

    if (intent === 'ecommerce') {
      routes.push({ method: 'GET', path: '/products', description: 'List products with filters', auth: false, agentRole: 'backend_engineer' })
      routes.push({ method: 'GET', path: '/products/:id', description: 'Get product details', auth: false, agentRole: 'backend_engineer' })
      routes.push({ method: 'POST', path: '/orders', description: 'Create new order', auth: true, agentRole: 'backend_engineer' })
      routes.push({ method: 'GET', path: '/orders', description: 'List user orders', auth: true, agentRole: 'backend_engineer' })
    }

    if (intent === 'saas' || intent === 'web_app' || intent === 'dashboard') {
      routes.push({ method: 'GET', path: '/workspaces', description: 'List user workspaces', auth: true, agentRole: 'backend_engineer' })
      routes.push({ method: 'POST', path: '/workspaces', description: 'Create workspace', auth: true, agentRole: 'backend_engineer' })
      routes.push({ method: 'GET', path: '/workspaces/:id', description: 'Get workspace details', auth: true, agentRole: 'backend_engineer' })
    }

    if (input.needsPayments) {
      routes.push({ method: 'POST', path: '/billing/checkout', description: 'Create Stripe checkout session', auth: true, agentRole: 'backend_engineer' })
      routes.push({ method: 'POST', path: '/billing/webhook', description: 'Handle Stripe webhooks', auth: false, agentRole: 'backend_engineer' })
      routes.push({ method: 'GET', path: '/billing/portal', description: 'Get billing portal URL', auth: true, agentRole: 'backend_engineer' })
    }

    return routes
  }

  private buildUiPages(intent: AppBuilderIntent, input: CreateAppBuilderWorkflowDto): UiPage[] {
    const pages: UiPage[] = []

    if (intent === 'landing_page') {
      pages.push({
        name: 'Landing Page',
        path: '/',
        description: 'Main marketing page',
        sections: ['hero', 'features', 'how_it_works', 'pricing', 'testimonials', 'faq', 'cta', 'footer'],
        agentRole: 'frontend_engineer',
      })
      return pages
    }

    pages.push({ name: 'Home / Dashboard', path: '/', description: 'Main app dashboard', sections: ['metrics', 'recent_activity', 'quick_actions'], agentRole: 'frontend_engineer' })
    pages.push({ name: 'Login', path: '/login', description: 'Authentication page', sections: ['login_form', 'oauth_buttons'], agentRole: 'frontend_engineer' })
    pages.push({ name: 'Register', path: '/register', description: 'Sign up page', sections: ['register_form', 'oauth_buttons'], agentRole: 'frontend_engineer' })
    pages.push({ name: 'Settings', path: '/settings', description: 'User account settings', sections: ['profile', 'security', 'notifications', 'billing'], agentRole: 'frontend_engineer' })

    if (intent === 'ecommerce') {
      pages.push({ name: 'Products', path: '/products', description: 'Product catalog', sections: ['filters', 'product_grid', 'pagination'], agentRole: 'frontend_engineer' })
      pages.push({ name: 'Product Detail', path: '/products/:id', description: 'Single product page', sections: ['images', 'details', 'add_to_cart', 'reviews'], agentRole: 'frontend_engineer' })
      pages.push({ name: 'Cart', path: '/cart', description: 'Shopping cart', sections: ['items', 'summary', 'checkout_button'], agentRole: 'frontend_engineer' })
      pages.push({ name: 'Checkout', path: '/checkout', description: 'Checkout flow', sections: ['shipping', 'payment', 'order_review'], agentRole: 'frontend_engineer' })
    }

    if (input.needsAdminPanel) {
      pages.push({ name: 'Admin Dashboard', path: '/admin', description: 'Admin control panel', sections: ['stats', 'user_table', 'recent_orders'], agentRole: 'frontend_engineer' })
    }

    return pages
  }

  private buildDeploymentPlan(intent: AppBuilderIntent, stack: TechStack[]): DeploymentStep[] {
    const usesVercel = stack.includes('vercel')
    const usesRailway = stack.includes('railway')
    const steps: DeploymentStep[] = []

    steps.push({ order: 1, name: 'Set environment variables', provider: 'local', action: 'configure .env files for all secrets', requiresApproval: false })
    steps.push({ order: 2, name: 'Run type-check', provider: 'local', action: 'tsc --noEmit across all packages', requiresApproval: false })
    steps.push({ order: 3, name: 'Run tests', provider: 'local', action: 'pnpm test --all', requiresApproval: false })

    if (usesRailway) {
      steps.push({ order: 4, name: 'Deploy database', provider: 'railway', action: 'provision PostgreSQL and run migrations', requiresApproval: true })
    }

    if (usesVercel) {
      steps.push({ order: 5, name: 'Deploy frontend', provider: 'vercel', action: 'connect GitHub repo and set env vars', requiresApproval: true })
    }

    if (stack.includes('nestjs') || stack.includes('express')) {
      steps.push({ order: 6, name: 'Deploy API', provider: usesRailway ? 'railway' : 'render', action: 'deploy API server with health check', requiresApproval: true })
    }

    steps.push({ order: 7, name: 'Configure custom domain', provider: 'dns', action: 'point domain to deployment, configure SSL', requiresApproval: true })
    steps.push({ order: 8, name: 'Smoke test production', provider: 'local', action: 'run critical path test against production URL', requiresApproval: false })

    return steps
  }

  private buildAgentRoles(): AgentRoleAssignment[] {
    return [
      {
        role: 'product_manager',
        responsibilities: ['Define user stories', 'Prioritize features', 'Create acceptance criteria'],
        outputArtifacts: ['feature_list.md', 'user_stories.md', 'acceptance_criteria.md'],
      },
      {
        role: 'frontend_engineer',
        responsibilities: ['Build React/Next.js components', 'Implement UI pages', 'Handle form validation'],
        outputArtifacts: ['components/', 'pages/', 'hooks/', 'styles/'],
      },
      {
        role: 'backend_engineer',
        responsibilities: ['Build API routes', 'Implement business logic', 'Handle authentication'],
        outputArtifacts: ['controllers/', 'services/', 'modules/', 'guards/'],
      },
      {
        role: 'database_architect',
        responsibilities: ['Design schema', 'Write migrations', 'Optimize queries'],
        outputArtifacts: ['schema.prisma', 'migrations/', 'seed.ts'],
      },
      {
        role: 'qa_tester',
        responsibilities: ['Write unit tests', 'Write integration tests', 'Run type-check'],
        outputArtifacts: ['*.spec.ts', '*.test.ts', 'e2e/'],
      },
      {
        role: 'deployment_engineer',
        responsibilities: ['Configure CI/CD', 'Set up hosting', 'Configure env vars'],
        outputArtifacts: ['.github/workflows/', 'Dockerfile', '.env.example', 'README.md'],
      },
    ]
  }

  private buildDeliverables(intent: AppBuilderIntent): string[] {
    return [
      'Complete feature list with priorities and estimates',
      'Database schema (Prisma-compatible)',
      'API route specification',
      'UI page map with sections',
      'Tech stack configuration',
      'Deployment plan with steps',
      'Agent role assignments',
      intent === 'landing_page' ? 'Landing page sections and copy prompts' : 'Full-stack codebase structure',
    ]
  }

  private buildSummary(intent: AppBuilderIntent, stack: TechStack[], featureCount: number): string {
    return `Builds a ${intent} application using ${stack.slice(0, 3).join(', ')}. Includes ${featureCount} features across PM, frontend, backend, DB, QA, and deployment agent roles.`
  }

  private findMissingInputs(intent: AppBuilderIntent, input: CreateAppBuilderWorkflowDto): string[] {
    const missing: string[] = []
    if (!input.prompt?.trim()) missing.push('App description is required.')
    if (!input.appName) missing.push('App name recommended for better output.')
    if (input.needsPayments && !input.preferredStack?.includes('nestjs')) missing.push('Backend stack required for payment integration.')
    return missing
  }
}
