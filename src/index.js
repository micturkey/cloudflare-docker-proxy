addEventListener("fetch", (event) => {
  event.passThroughOnException();
  event.respondWith(handleRequest(event.request));
});

const dockerHub = "https://registry-1.docker.io";

const routes = {
  // production
  "docker.*": dockerHub,
  "quay.*": "https://quay.io",
  "gcr.*": "https://gcr.io",
  "k8s-gcr.*": "https://k8s.gcr.io",
  "k8s.*": "https://registry.k8s.io",
  "ghcr.*": "https://ghcr.io",
  "cloudsmith.*": "https://docker.cloudsmith.io",

  // staging
  "docker-staging.*": dockerHub,
};

function routeByHosts(host) {
  for (const pattern in routes) {
    if (new RegExp("^" + pattern.replace('.', '\\.').replace('*', '.*') + "$").test(host)) {
      return routes[pattern];
    }
  }
  if (MODE == "debug") {
    return TARGET_UPSTREAM;
  }
  return "";
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const upstream = routeByHosts(url.hostname);
  if (upstream === "") {
    return new Response(
      JSON.stringify({
        routes: routes,
      }),
      {
        status: 404,
      }
    );
  }
  const isDockerHub = upstream == dockerHub;
  const authorization = request.headers.get("Authorization");
  if (url.pathname == "/v2/") {
    const newUrl = new URL(upstream + "/v2/");
    const headers = new Headers();
    if (authorization) {
      headers.set("Authorization", authorization);
    }
    const resp = await fetch(newUrl.toString(), {
      method: "GET",
      headers: headers,
      redirect: "follow",
    });
    if (resp.status === 401) {
      if (MODE == "debug") {
        headers.set(
          "Www-Authenticate",
          `Bearer realm="http://${url.host}/v2/auth",service="cloudflare-docker-proxy"`
        );
      } else {
        headers.set(
          "Www-Authenticate",
          `Bearer realm="https://${url.hostname}/v2/auth",service="cloudflare-docker-proxy"`
        );
      }
      return new Response(JSON.stringify({ message: "UNAUTHORIZED" }), {
        status: 401,
        headers: headers,
      });
    } else {
      return resp;
    }
  }
  // Handle other requests...
  return routeRequest(request, url, upstream, isDockerHub, authorization);
}

// Additional functions like parseAuthenticate and fetchToken would remain the same.
