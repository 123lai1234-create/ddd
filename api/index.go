package handler

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

// Handler is the Vercel serverless function entry point.
// It reverse-proxies all requests to the Railway API backend.
func Handler(w http.ResponseWriter, r *http.Request) {
	target := os.Getenv("API_PROXY_TARGET")
	if target == "" {
		target = "https://donttalk-api-production.up.railway.app"
	}
	target = strings.TrimRight(target, "/")

	origin, err := url.Parse(target)
	if err != nil {
		http.Error(w, "invalid proxy target", http.StatusInternalServerError)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(origin)
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = origin.Scheme
		req.URL.Host = origin.Host
		req.Host = origin.Host
		// preserve original path and query
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
	}

	// propagate CORS headers from upstream
	proxy.ModifyResponse = func(resp *http.Response) error {
		if resp.Header.Get("Access-Control-Allow-Origin") == "" {
			resp.Header.Set("Access-Control-Allow-Origin", "*")
		}
		return nil
	}

	// handle preflight
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	proxy.ServeHTTP(w, r)
}
