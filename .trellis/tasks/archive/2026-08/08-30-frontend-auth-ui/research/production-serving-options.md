# Production SPA serving and same-origin API options

Research snapshot: 2026-08-31.

## Requirement exposed by the frontend design

The browser must call relative `/api` URLs so the HttpOnly session remains same-origin and the backend's exact-Origin enforcement remains intact. Vite can proxy `/api` during development, but `vite preview` is explicitly a local preview tool, not a production server. A production artifact therefore needs a static-file server, SPA history fallback and `/api` reverse proxy.

## Options

| Option | Shape | Advantage | Cost/risk |
| --- | --- | --- | --- |
| Dedicated Caddy admin image | Node build stage emits `dist`; pinned Caddy runtime serves files and proxies `/api` to `api:8080` | Short readable config, static server and reverse proxy in one small runtime, keeps API/admin build boundaries independent | Adds one production container/image and Caddy operational knowledge |
| Dedicated Nginx admin image | Node build stage plus pinned Nginx runtime with `try_files` and `proxy_pass` | Extremely established and widely understood | More verbose config; unprivileged runtime and header/cache behavior need deliberate setup; no requirement-specific advantage over Caddy here |
| Apache HTTP Server | Static serving plus `mod_proxy` | Mature and capable of both duties | Larger module/configuration surface than this use case needs; no project-specific benefit over Caddy or Nginx |
| Traefik | Docker-aware edge router plus a separate static server | Strong dynamic service discovery and routing when a deployment has many services | Does not replace the SPA static server, so it adds another component for a four-service Compose topology |
| Envoy or HAProxy | Dedicated service proxy/load balancer plus a separate static server | Strong traffic policy and observability for larger service topologies | Solves a broader proxy problem than this template has and still needs a static server |
| Go API serves or embeds `dist` | One externally visible process/container | Fewer runtime containers | Couples frontend build/release/catch-all routing into the Go service, conflicts with the accepted independent-app boundary, and makes API-only changes rebuild frontend delivery |
| External gateway left to every generated project | Ship only `dist` and documentation | No bundled gateway choice | Generated Compose cannot run or verify the production browser flow; every user must independently rediscover SPA fallback, cookies and `/api` proxying |
| `vite preview` in production | Run Node preview server | Almost no configuration | Rejected by Vite's own deployment guidance; it is not a production server |

## Selection criteria

The choice is driven by the smallest component that satisfies this template's actual boundary, rather than by benchmark rankings. The candidate should:

1. Serve immutable Vite assets and a revalidated `index.html`.
2. Implement an explicit SPA history fallback without swallowing `/api` errors.
3. Proxy both exact `/api` and `/api/*` to the private Go service without rewriting the path, preserving the one browser origin used by cookies and Origin validation.
4. Keep the frontend runtime independent from the Go API and avoid carrying Node into the production image.
5. Have a short configuration that can be reviewed alongside the template, a pinned image, and an intentional non-root/container setup.
6. Leave room for direct TLS termination later without requiring the generic template to own public DNS or certificates.

On these criteria, Caddy and Nginx are the only close finalists. Both have far more throughput than this project's static and authentication traffic requires, so performance is not a useful differentiator. Nginx is the better default only when operator familiarity or an existing Nginx platform is the overriding constraint. Caddy is the better template default because its file server and reverse proxy express this exact topology with fewer interacting routing rules. Its automatic HTTPS is a future convenience, not the reason for selecting it, and will not be implicitly enabled for the generic Compose environment.

An abbreviated comparison illustrates the configuration surface; the implementation must additionally set exact cache/security behavior and cover exact `/api`:

```caddyfile
:8080 {
	@api path /api /api/*
	handle @api {
		reverse_proxy api:8080
	}
	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

```nginx
location = /api {
    proxy_pass http://api:8080;
}
location /api/ {
    proxy_pass http://api:8080;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

The Nginx version is still perfectly viable, but its `location` precedence and `proxy_pass` URI/trailing-slash rules create more review-sensitive behavior once cache headers, security headers and exact path handling are added.

## Recommendation

Add a dedicated **Caddy-based `admin` image/service**:

1. A pinned Node 24 build stage installs the admin package and runs its production build.
2. A pinned Caddy runtime contains only the built assets and reviewed Caddyfile; Node and source files are absent at runtime.
3. An exact matcher for `/api` and `/api/*` reverse-proxies to the private Compose `api:8080` service without changing the path. All other missing non-asset routes fall back to `index.html` for TanStack Router history navigation.
4. Hashed Vite assets may receive long immutable caching; `index.html` must revalidate. API responses preserve backend `Cache-Control: no-store` and Problem Details content types.
5. Compose publishes the admin/gateway port rather than making browser clients call the API port directly. `APP_PUBLIC_URL` names that same public origin, so the browser's automatic `Origin` header matches the backend configuration.
6. Development remains `pnpm dev` with a Vite `/api` proxy. Production uses the Caddy image; `pnpm preview` remains a local build-inspection command only.

Caddy's automatic public TLS is not assumed inside the generic Compose topology. A production operator may expose it directly with an accepted domain/TLS configuration or place it behind an external TLS ingress, but the browser-visible origin must still equal `APP_PUBLIC_URL`.

## Primary sources

- Vite static deployment and preview warning: <https://vite.dev/guide/static-deploy.html>
- Caddy static files: <https://caddyserver.com/docs/caddyfile/directives/file_server>
- Caddy reverse proxy: <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>
- Nginx `try_files`: <https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files>
- Nginx `proxy_pass`: <https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass>
- Apache `mod_proxy`: <https://httpd.apache.org/docs/2.4/mod/mod_proxy.html>
- Traefik routing model: <https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/overview/>
- Envoy overview: <https://www.envoyproxy.io/docs/envoy/latest/intro/what_is_envoy>
