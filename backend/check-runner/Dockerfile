FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /runner
RUN npm install --ignore-scripts --no-audit --no-fund --package-lock=false playwright-core@1.64.1
COPY web-check.mjs .
USER pwuser
ENTRYPOINT ["timeout", "--kill-after=2s", "30s", "node", "web-check.mjs"]
