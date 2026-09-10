FROM node:24-alpine AS mermaid-vault-frontend-dependencies

RUN apk --no-cache add build-base git python3 && \
    rm -rf /var/cache/apk/*

RUN corepack enable pnpm && \
    corepack prepare pnpm@12.3.4 --activate

WORKDIR /app

COPY ./package.json .
COPY ./pnpm-lock.yaml .
COPY ./pnpm-workspace.yaml* ./

RUN pnpm install

FROM mermaid-vault-frontend-dependencies AS mermaid-vault-frontend-builder

ARG MERMAID_RENDERER_URL
ARG MERMAID_KROKI_RENDERER_URL
ARG MERMAID_ANALYTICS_URL
ARG MERMAID_DOMAIN
ARG MERMAID_IS_ENABLED_MERMAID_CHART_LINKS
ARG MERMAID_PRIVACY_POLICY_URL
ARG MERMAID_HIDE_PRIVACY_POLICY
ARG MERMAID_BASE_PATH
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . ./

RUN pnpm build

FROM mermaid-vault-frontend-builder AS mermaid-dev

ENTRYPOINT ["pnpm", "dev"]

FROM nginx:alpine AS mermaid

COPY ./nginx-templates /etc/nginx/templates
COPY --from=mermaid-vault-frontend-builder /app/docs /usr/share/nginx/html
COPY ./start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
ENTRYPOINT ["/start.sh"]
