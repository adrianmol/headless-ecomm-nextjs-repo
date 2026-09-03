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

          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.IMAGE_TAG}" +
            (env.IS_ROLLBACK == 'true' ? ' (rollback)' : '')
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
      steps {
        sshagent(credentials: ['hetzner-deploy-key']) {
          // Through the reverse proxy this time, not just the container port,
          // so a broken vhost or expired certificate fails the build rather
          // than the first customer.
          sh '''
            set -eu
            ssh -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST" \
              "curl -fsS --max-time 10 -o /dev/null -w 'origin: %{http_code}\\n' https://$DEPLOY_HOST/"
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
