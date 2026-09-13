#!/usr/bin/env bash
# One-time setup of a Hetzner Cloud server (root, Debian/Ubuntu) to run this
# storefront. Idempotent — safe to re-run. After this, .github/workflows/deploy.yml
# deploys with deploy/deploy.sh and needs nothing else from the host.
#
# Unlike a shared-hosting account, everything here is ours: the script installs
# Docker, creates the unprivileged deploy user the pipeline logs in as, and lays
# out /opt/headless-ecomm-flow. It deliberately does NOT install or reconfigure a
# reverse proxy — if one is already terminating TLS, fighting it over :443 is the
# fastest way to take a live site down. It checks for one and prints the config it
# needs instead.
#
# Before running, in the Hetzner console:
#   1. Create the server (Debian 12 or Ubuntu 24.04) and add your SSH key
#   2. Point the domain's A/AAAA records at it
#   3. Optionally attach a Cloud Firewall allowing 22, 80 and 443 only
#
# Run from the repo root on your machine:
#   ssh root@HOST "DEPLOY_PUBKEY='ssh-ed25519 AAAA… github-actions' DOMAIN=shop.example.ro \
#       bash -s -- init" < deploy/hetzner.sh
#
#   ... check   — only report what the host has; changes nothing. Safe on a live server.
set -euo pipefail

ACTION=${1:-check}

APP_NAME=headless-ecomm-flow
APP_DIR=/opt/headless-ecomm-flow
ENV_FILE="$APP_DIR/app.env"
APP_PORT=3000
DEPLOY_USER=${DEPLOY_USER:-deploy}

# Every key the container needs. STOREFRONT_URL is on this list because its
# absence is silent in a way that matters: the product page throws inside
# generateMetadata, Next swallows it, and every PDP serves 200 with no canonical
# URL or Open Graph tags while the sitemap comes back empty. src/instrumentation.ts
# now refuses to start without it, which is why a missing value shows up here as a
# failed health check rather than as lost search visibility.
REQUIRED_ENV=(NODE_ENV COMMERCE_API_URL STOREFRONT_URL)
OPTIONAL_ENV=(REVALIDATE_SECRET HUB_API_URL HUB_API_KEY HUB_API_SECRET OTEL_EXPORTER_OTLP_ENDPOINT)

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '   \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[1;33m⚠\033[0m  %s\n' "$*"; }
bad()  { printf '   \033[0;31m✗\033[0m %s\n' "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

check() {
    log "Host"
    echo "   user: $(whoami)   $( . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" )"
    echo "   kernel: $(uname -r)   arch: $(uname -m)"
    free -h 2>/dev/null | awk '/Mem:/ {print "   memory: "$2" total, "$7" available"}' || true
    df -h / 2>/dev/null | tail -1 | awk '{print "   disk /: "$2" total, "$4" free ("$5" used)"}'

    log "Docker"
    if have docker; then
        ok "$(docker --version)"
        if docker info >/dev/null 2>&1; then
            ok "daemon reachable"
        else
            bad "daemon not reachable (systemctl status docker)"
        fi
    else
        bad "not installed — run this script with 'init'"
    fi

    log "Deploy user ($DEPLOY_USER)"
    if id "$DEPLOY_USER" >/dev/null 2>&1; then
        ok "exists"
        if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
            ok "in the docker group"
        else
            bad "not in the docker group — deploy.sh cannot run docker"
        fi
        local keys="/home/$DEPLOY_USER/.ssh/authorized_keys"
        if [ -s "$keys" ]; then
            ok "authorized_keys: $(grep -c '^ssh-' "$keys" 2>/dev/null || echo 0) key(s)"
        else
            bad "no authorized_keys — the pipeline cannot log in"
        fi
    else
        bad "missing — run this script with 'init'"
    fi

    log "Application directory"
    if [ -d "$APP_DIR" ]; then
        ok "$APP_DIR ($(stat -c '%U:%G %a' "$APP_DIR"))"
    else
        bad "$APP_DIR missing"
    fi
    if [ -f "$ENV_FILE" ]; then
        local mode; mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo "?")
        if [ "$mode" = "600" ]; then ok "app.env present, mode 600"; else bad "app.env mode $mode — must be 600"; fi
        # Key names only. Values never leave the host through this script.
        local missing=() present=()
        for key in "${REQUIRED_ENV[@]}"; do
            if grep -qE "^${key}=.+" "$ENV_FILE"; then present+=("$key"); else missing+=("$key"); fi
        done
        [ ${#present[@]} -gt 0 ] && ok "set: ${present[*]}"
        if [ ${#missing[@]} -gt 0 ]; then
            bad "missing or empty: ${missing[*]}"
            case " ${missing[*]} " in *" STOREFRONT_URL "*)
                warn "without STOREFRONT_URL the container refuses to start, so the deploy will roll back" ;;
            esac
        fi
        local opt=()
        for key in "${OPTIONAL_ENV[@]}"; do grep -qE "^${key}=.+" "$ENV_FILE" && opt+=("$key"); done
        [ ${#opt[@]} -gt 0 ] && echo "   optional set: ${opt[*]}"
    else
        warn "app.env absent — the pipeline writes it before the first deploy"
    fi

    log "Container"
    if have docker && docker inspect "$APP_NAME" >/dev/null 2>&1; then
        ok "image:  $(docker inspect --format '{{.Config.Image}}' "$APP_NAME")"
        ok "state:  $(docker inspect --format '{{.State.Status}} (health: {{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}})' "$APP_NAME")"
        if curl -fsS --max-time 5 "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then
            ok "responds on 127.0.0.1:${APP_PORT}/health"
        else
            bad "no healthy response on 127.0.0.1:${APP_PORT}/health"
        fi
    else
        warn "not deployed yet"
    fi

    log "Network exposure"
    if have ss; then
        # The app must be loopback-only: TLS terminates at the proxy, the session
        # cookie is Secure, and the app trusts X-Forwarded-*. Reachable directly
        # from the internet, those become someone else's input.
        local appline; appline=$(ss -ltnH "sport = :${APP_PORT}" 2>/dev/null || true)
        if [ -z "$appline" ]; then
            warn "nothing listening on :${APP_PORT}"
        elif printf '%s' "$appline" | grep -qE '(127\.0\.0\.1|\[::1\]):'"${APP_PORT}"; then
            ok ":${APP_PORT} bound to loopback only"
        else
            bad ":${APP_PORT} is NOT loopback-only — the app is exposed directly:"
            printf '        %s\n' "$appline"
        fi
        for port in 80 443; do
            local l; l=$(ss -ltnH "sport = :${port}" 2>/dev/null || true)
            [ -n "$l" ] && ok ":${port} listening ($(printf '%s' "$l" | awk '{print $4}' | paste -sd' ' -))" \
                        || warn ":${port} nothing listening — no reverse proxy?"
        done
    fi
    for proxy in caddy nginx traefik haproxy; do
        systemctl is-active --quiet "$proxy" 2>/dev/null && ok "reverse proxy: $proxy is active"
    done

    if [ -n "${DOMAIN:-}" ]; then
        log "TLS for $DOMAIN"
        local expiry
        if expiry=$(echo | timeout 10 openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
                    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2); then
            [ -n "$expiry" ] && ok "certificate expires $expiry" || bad "no certificate returned"
        else
            bad "could not complete a TLS handshake"
        fi
        # Proves the proxy reaches the app, not just that it answers.
        local code; code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/health" || echo 000)
        [ "$code" = "200" ] && ok "https://$DOMAIN/health → 200" || bad "https://$DOMAIN/health → $code"
    fi

    log "Value for the DEPLOY_KNOWN_HOSTS secret"
    echo "   (paste verbatim — this is what makes StrictHostKeyChecking mean anything)"
    # Built from the host key itself rather than by scanning.
    #
    # The first version ran `ssh-keyscan -H localhost` and rewrote the hostname to
    # the public IP with sed. That produces a value that can never match: -H stores
    # a *hash* of the hostname, so replacing the name afterwards leaves a hash of
    # "localhost" labelled as the IP. Reading the key and prefixing the address is
    # both simpler and actually a valid known_hosts line.
    local ip pub
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -r /etc/ssh/ssh_host_ed25519_key.pub ]; then
        pub=$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
        echo "     ${ip:-<public-ip>} $pub"
        echo "   fingerprint (compare with what your ssh client shows):"
        ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null | sed 's/^/     /' || true
    else
        warn "host key unreadable — run 'ssh-keyscan -t ed25519 <ip>' from your machine"
    fi

    log "Security"
    if have unattended-upgrade || [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
        ok "unattended-upgrades configured"
    else
        warn "unattended-upgrades not configured — security patches are manual"
    fi
    if have ufw; then
        echo "   ufw: $(ufw status | head -1 | sed 's/Status: //')"
    else
        echo "   ufw: not installed (a Hetzner Cloud Firewall is an equally good answer)"
    fi
}

require_root() {
    [ "$(id -u)" -eq 0 ] || { echo "init must run as root (check can run as anyone)"; exit 1; }
}

# Fails before the first change rather than halfway through. Every install step
# below is apt- and adduser-based, and discovering that on a RHEL-family image
# after Docker's repo has been written is a worse outcome than refusing up front.
require_debian_like() {
    if ! have apt-get || ! have adduser; then
        bad "init supports Debian and Ubuntu (apt-get + adduser)."
        echo "     Hetzner also offers Fedora, Rocky and Alma; on those, do the same"
        echo "     four things by hand: install Docker, create the $DEPLOY_USER user in the"
        echo "     docker group with the pipeline's key, create $APP_DIR (750, owned by"
        echo "     $DEPLOY_USER) and an app.env at mode 600. Then 'check' will verify it."
        exit 1
    fi
}

install_docker() {
    log "Docker"
    if have docker; then
        ok "already installed: $(docker --version)"
        return
    fi
    # Docker's own apt repository, with a pinned keyring — not the piped
    # get.docker.com shell script. Same software, one fewer arbitrary script
    # executed as root.
    . /etc/os-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin >/dev/null
    systemctl enable --now docker
    ok "installed $(docker --version)"
}

create_deploy_user() {
    log "Deploy user ($DEPLOY_USER)"
    if id "$DEPLOY_USER" >/dev/null 2>&1; then
        ok "exists"
    else
        # No password, no sudo: this account exists to run deploy.sh and nothing
        # else. Docker group membership is effectively root on the host, which is
        # why it gets no second route to privilege.
        adduser --disabled-password --gecos "" "$DEPLOY_USER" >/dev/null
        ok "created"
    fi
    usermod -aG docker "$DEPLOY_USER"
    ok "in the docker group"

    if [ -n "${DEPLOY_PUBKEY:-}" ]; then
        local ssh_dir="/home/$DEPLOY_USER/.ssh"
        install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ssh_dir"
        touch "$ssh_dir/authorized_keys"
        chmod 600 "$ssh_dir/authorized_keys"
        chown "$DEPLOY_USER:$DEPLOY_USER" "$ssh_dir/authorized_keys"
        if grep -qF "$DEPLOY_PUBKEY" "$ssh_dir/authorized_keys"; then
            ok "public key already authorised"
        else
            printf '%s\n' "$DEPLOY_PUBKEY" >> "$ssh_dir/authorized_keys"
            ok "public key added"
        fi
    else
        warn "DEPLOY_PUBKEY not given — add the pipeline's public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
    fi
}

create_app_dir() {
    log "Application directory"
    install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
    ok "$APP_DIR owned by $DEPLOY_USER (mode 750)"

    if [ -f "$ENV_FILE" ]; then
        # Never rewritten. It holds live secrets, and clobbering it on a re-run
        # would break a working deployment to no purpose.
        ok "app.env exists — left untouched"
    else
        # A skeleton, so the file's shape and permissions are right before the
        # pipeline ever writes it. Values stay empty on purpose: this script has
        # no business inventing a commerce URL or a secret, and an empty
        # STOREFRONT_URL correctly stops the container from starting.
        umask 077
        { printf 'NODE_ENV=production\n'
          for key in COMMERCE_API_URL STOREFRONT_URL REVALIDATE_SECRET HUB_API_URL HUB_API_KEY HUB_API_SECRET; do
              printf '%s=\n' "$key"
          done
        } > "$ENV_FILE"
        chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        ok "app.env skeleton written (mode 600, empty values — the pipeline fills it)"
    fi
}

harden() {
    log "Unattended security upgrades"
    if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
        ok "already configured"
    else
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null
        cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
        ok "enabled"
    fi

    if [ "${SETUP_FIREWALL:-0}" = "1" ]; then
        log "Firewall (ufw)"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null
        # SSH first, always. Enabling ufw before allowing 22 locks you out of a
        # remote machine, and that is not recoverable without console access.
        ufw allow OpenSSH >/dev/null
        ufw allow 80/tcp >/dev/null
        ufw allow 443/tcp >/dev/null
        ufw --force enable >/dev/null
        ok "22, 80, 443 allowed; everything else denied"
        ok "port $APP_PORT is not opened — the container binds loopback and the proxy reaches it locally"
    else
        warn "firewall untouched (pass SETUP_FIREWALL=1 to configure ufw)"
        echo "     A Hetzner Cloud Firewall allowing 22, 80 and 443 is an equally good answer"
        echo "     and cannot lock you out of the console."
    fi
}

init() {
    require_root
    require_debian_like
    install_docker
    create_deploy_user
    create_app_dir
    harden

    local ip; ip=$(hostname -I 2>/dev/null | awk '{print $1}')

    log "Done — remaining steps"
    cat <<DONE

1. Reverse proxy. Not installed by this script: if one is already terminating TLS,
   taking :443 from it is the quickest way to break a live site.

   It must forward to 127.0.0.1:${APP_PORT} and it must *overwrite*, never pass
   through, these headers:

     X-Forwarded-Proto   the app's session cookie is Secure; without this it is
                         dropped and shoppers return from payment with no basket
     X-Forwarded-Host    isSameOrigin() compares the Origin header against this to
                         reject cross-site mutations. If a client can set it, that
                         check can be fed a host of their choosing.

   Caddy needs no more than this, and gets certificates itself:

     ${DOMAIN:-shop.example.com} {
         reverse_proxy 127.0.0.1:${APP_PORT}
     }

   For nginx, set proxy_set_header X-Forwarded-Proto \$scheme and
   X-Forwarded-Host \$host explicitly — do not use \$http_x_forwarded_host.

2. GitHub → Settings → Secrets and variables → Actions:

     Secret   DEPLOY_HOST         ${ip:-<the server IP>}
     Secret   DEPLOY_USER         ${DEPLOY_USER}
     Secret   DEPLOY_SSH_KEY      the private half of the key you passed as DEPLOY_PUBKEY
     Secret   DEPLOY_KNOWN_HOSTS  run: ssh-keyscan -t ed25519 ${ip:-<the server IP>}
     Secret   COMMERCE_API_URL    the commerce API base URL
     Secret   REVALIDATE_SECRET   openssl rand -hex 32
     Secret   HUB_API_KEY         }  only once pages read the HUB catalogue
     Secret   HUB_API_SECRET      }
     Variable STOREFRONT_URL      https://${DOMAIN:-shop.example.com}
     Variable HUB_API_URL         https://hub.reprint.ro

   STOREFRONT_URL is a *variable*, not a secret. It is a public URL, and marking it
   secret only means Actions redacts it from the logs where you need to read it.

3. Deploy. Run the Deploy workflow manually first (Actions → Deploy → Run workflow)
   rather than waiting for a push, so the first attempt is one you are watching.

4. Verify from your machine, not the server:

     curl -fsS https://${DOMAIN:-shop.example.com}/health
     curl -fsS https://${DOMAIN:-shop.example.com}/sitemap.xml | grep -c '<loc>'
     curl -fsS https://${DOMAIN:-shop.example.com}/produse/<a-real-slug> | grep -c 'rel="canonical"'

   The last two are not decoration: both were silently empty on a container with no
   STOREFRONT_URL, and the deploy's own smoke test passed anyway.

Re-run 'bash hetzner.sh check' at any time — it changes nothing.
DONE
}

case "$ACTION" in
    init)  init ;;
    check) check ;;
    *) echo "usage: hetzner.sh init|check"; exit 1 ;;
esac
