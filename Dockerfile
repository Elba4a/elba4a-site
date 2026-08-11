FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# Copy the site explicitly — never `COPY .`, so config, docs and dotfiles
# can't leak into the public web root.
COPY index.html /srv/
COPY en /srv/en/
COPY assets /srv/assets/
