FROM alpine:3.21
RUN apk add --no-cache socat
EXPOSE 5432
CMD ["socat", "TCP-LISTEN:5432,fork,reuseaddr", "TCP:db.wbamdjgcoezevimohlcb.supabase.co:5432"]
