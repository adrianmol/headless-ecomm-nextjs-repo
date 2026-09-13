// SUPERSEDED by .github/workflows/deploy.yml (2026-09-13).
//
// Delivery moved to GitHub Actions because the commerce API is public HTTPS, so
// the build no longer needs an agent inside a private network — which was the
// only reason this pipeline needed its own Docker host and container registry.
// GHCR is free for private packages and the deploy authenticates its pull with
// the workflow run's own token, so no long-lived registry credential exists.
//
// Kept for reference, not for use. Do NOT run both: two pipelines deploying the
// same host will fight over the container and over app.env. This one also writes
// an app.env with no STOREFRONT_URL, which silently strips canonical URLs and Open
// Graph tags from every product page and empties the sitemap.
//
// Continuous *delivery* only.
//
// Correctness gates (lint, contract drift, typecheck, tests, Lighthouse
// budgets) stay in GitHub Actions — see .github/workflows/ci.yml. This
// pipeline assumes the commit it is handed is already green and concerns
// itself solely with turning it into a running container on Hetzner.
//
// Required Jenkins credentials (IDs must match, create them before first run):
//   hetzner-registry     Username/password — container registry push
//   hetzner-deploy-key   SSH private key   — deploy user on the Hetzner host
//   commerce-api-url     Secret text       — COMMERCE_API_URL
//   revalidate-secret    Secret text       — REVALIDATE_SECRET
pipeline {
  // A static agent with docker, git, ssh and curl. Node/pnpm are NOT needed:
  // the application build happens inside the Docker build.
  agent { label 'docker' }

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '50'))
  }

  parameters {
    string(
      name: 'ROLLBACK_TAG',
      defaultValue: '',
      description: 'Redeploy an image tag that already exists in the registry (e.g. a previous git SHA). Leave empty to build and deploy this commit.'
    )
    booleanParam(
      name: 'BUILD_WITH_MOCK_API',
      defaultValue: false,
      description: 'Build with scripts/mock-api.mjs instead of the real backend. For exercising this pipeline before the commerce API exists. The resulting image has FIXTURE products baked into the prerendered catalogue — never deploy it to customers.'
    )
  }

  environment {
    REGISTRY    = 'registry.example.com'
    IMAGE_REPO  = "${REGISTRY}/headless-ecomm-flow"
    APP_NAME    = 'headless-ecomm-flow'

    DEPLOY_USER = 'deploy'
    DEPLOY_HOST = 'your-server.hetzner.example'
    APP_PORT    = '3000'
    REMOTE_DIR  = '/opt/headless-ecomm-flow'
    ENV_FILE    = '/opt/headless-ecomm-flow/app.env'

    // Product used by the post-deploy smoke test. Must exist in the catalogue.
    SMOKE_SLUG  = 'toner-compatibil-hp-35a-black-cb435a'
  }

  stages {
    stage('Resolve version') {
      steps {
        script {
          // Immutable, content-addressed tags. `latest` is never deployed:
          // it makes "what is actually running?" unanswerable during an
          // incident and makes rollback guesswork.
          env.IMAGE_TAG = params.ROLLBACK_TAG?.trim()
            ?: sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
          env.IMAGE_REF = "${env.IMAGE_REPO}:${env.IMAGE_TAG}"
          env.IS_ROLLBACK = params.ROLLBACK_TAG?.trim() ? 'true' : 'false'
          env.BUILD_SCRIPT = params.BUILD_WITH_MOCK_API ? 'build:ci' : 'build'

          // Mock-API images are tagged distinctly so one can never be mistaken
          // for a real release in the registry or in `docker ps`.
          if (params.BUILD_WITH_MOCK_API && env.IS_ROLLBACK == 'false') {
            env.IMAGE_TAG = "${env.IMAGE_TAG}-mockapi"
            env.IMAGE_REF = "${env.IMAGE_REPO}:${env.IMAGE_TAG}"
          }

          // Only main reaches production. Without this, every feature branch
          // build deploys over the live storefront. Falls back through the
          // multibranch, freestyle and plain-checkout ways of learning the
          // branch, so this does not silently evaluate to "not main".
          def rawBranch = (
            env.BRANCH_NAME
              ?: env.GIT_BRANCH
              ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true)
          ).trim()
          env.GIT_BRANCH_NAME = rawBranch.replaceFirst(/^origin\//, '')
          env.IS_MAIN = env.GIT_BRANCH_NAME == 'main' ? 'true' : 'false'

          // A mock-API image has fixture products baked into its prerendered
          // catalogue. The parameter description warns about this, but a
          // warning is not a control: enforce it.
          env.IS_DEPLOYABLE =
            (env.IS_MAIN == 'true' && !params.BUILD_WITH_MOCK_API) ? 'true' : 'false'

          def suffix = []
          if (env.IS_ROLLBACK == 'true') suffix << 'rollback'
          if (params.BUILD_WITH_MOCK_API) suffix << 'mock-api'
          if (env.IS_DEPLOYABLE == 'false') suffix << "build-only:${env.GIT_BRANCH_NAME}"

          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.IMAGE_TAG}" +
            (suffix ? " (${suffix.join(', ')})" : '')

          if (env.IS_DEPLOYABLE == 'false') {
            echo "Not deploying: branch=${env.GIT_BRANCH_NAME}, " +
                 "mockApi=${params.BUILD_WITH_MOCK_API}. Image is built and pushed only."
          }
        }
      }
    }

    stage('Build image') {
      when { environment name: 'IS_ROLLBACK', value: 'false' }
      steps {
        // NOTE: this agent must be able to reach COMMERCE_API_URL. `next build`
        // prerenders the `use cache` catalog scopes and will fail on a DNS or
        // connection error. See the comment in the Dockerfile's build stage.
        withCredentials([string(credentialsId: 'commerce-api-url', variable: 'COMMERCE_API_URL')]) {
          // --pull so a stale local node:22 base does not silently outlive its
          // security updates on a long-lived agent.
          sh '''
            set -eu
            DOCKER_BUILDKIT=1 docker build \
              --pull \
              --build-arg "BUILD_SCRIPT=$BUILD_SCRIPT" \
              --build-arg "COMMERCE_API_URL=$COMMERCE_API_URL" \
              --tag "$IMAGE_REF" .
          '''
        }
      }
    }

    stage('Push image') {
      when { environment name: 'IS_ROLLBACK', value: 'false' }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'hetzner-registry',
          usernameVariable: 'REGISTRY_USER',
          passwordVariable: 'REGISTRY_PASS'
        )]) {
          sh '''
            set -eu
            echo "$REGISTRY_PASS" | docker login "$REGISTRY" --username "$REGISTRY_USER" --password-stdin
            docker push "$IMAGE_REF"
            docker logout "$REGISTRY"
          '''
        }
      }
    }

    stage('Sync runtime config') {
      when { environment name: 'IS_DEPLOYABLE', value: 'true' }
      steps {
        withCredentials([
          string(credentialsId: 'commerce-api-url', variable: 'COMMERCE_API_URL'),
          string(credentialsId: 'revalidate-secret', variable: 'REVALIDATE_SECRET')
        ]) {
          sshagent(credentials: ['hetzner-deploy-key']) {
            // Secrets travel over stdin, never as argv: anything on the remote
            // command line is visible to every user on the box via `ps`.
            // `set +x` keeps them out of the Jenkins console too.
            sh '''
              set -eu
              set +x
              ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" \
                "mkdir -p '$REMOTE_DIR' && umask 077 && cat > '$ENV_FILE'" <<EOF
NODE_ENV=production
COMMERCE_API_URL=${COMMERCE_API_URL}
REVALIDATE_SECRET=${REVALIDATE_SECRET}
EOF
              ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" "chmod 600 '$ENV_FILE'"
            '''
          }
        }
      }
    }

    stage('Deploy') {
      when { environment name: 'IS_DEPLOYABLE', value: 'true' }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'hetzner-registry',
          usernameVariable: 'REGISTRY_USER',
          passwordVariable: 'REGISTRY_PASS'
        )]) {
          sshagent(credentials: ['hetzner-deploy-key']) {
            sh '''
              set -eu
              scp -o StrictHostKeyChecking=yes deploy/deploy.sh "$DEPLOY_USER@$DEPLOY_HOST:$REMOTE_DIR/deploy.sh"
              ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" "chmod +x '$REMOTE_DIR/deploy.sh'"

              set +x
              echo "$REGISTRY_PASS" | ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" \
                "docker login '$REGISTRY' --username '$REGISTRY_USER' --password-stdin"
              set -x

              # deploy.sh health-checks the new container and rolls back to the
              # previously running image on its own if it fails.
              ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" \
                "'$REMOTE_DIR/deploy.sh' '$IMAGE_REF' '$APP_NAME' '$ENV_FILE' '$APP_PORT'"
            '''
          }
        }
      }
    }

    stage('Smoke test') {
      when { environment name: 'IS_DEPLOYABLE', value: 'true' }
      steps {
        sshagent(credentials: ['hetzner-deploy-key']) {
          // Through the reverse proxy, not the container port, so a broken
          // vhost or an expired certificate fails the build rather than the
          // first customer.
          //
          // Deliberately a PDP and not `/`. The homepage and /produse are
          // prerendered into the image, so both return 200 even when the
          // commerce API is completely unreachable — a smoke test against them
          // passes while every real page is broken. The PDP streams
          // availability at request time, so it is the only cheap check that
          // proves the running container can actually reach the backend.
          sh '''
            set -eu
            body="$(ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" \
              "curl -fsS --max-time 15 'https://$DEPLOY_HOST/produse/$SMOKE_SLUG'")"

            if ! printf '%s' "$body" | grep -Eq 'In stoc|Stoc limitat|Stoc epuizat'; then
              echo "SMOKE FAILED: PDP rendered no availability." >&2
              echo "The container is up but cannot reach COMMERCE_API_URL." >&2
              exit 1
            fi
            echo "smoke ok: PDP streamed live availability"
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker image prune --force --filter "until=168h" >/dev/null 2>&1 || true'
    }
    failure {
      echo "Deploy of ${env.IMAGE_TAG} failed. deploy.sh attempts an automatic rollback; " +
           "if it could not, rerun this job with ROLLBACK_TAG set to the last known good SHA."
    }
  }
}
