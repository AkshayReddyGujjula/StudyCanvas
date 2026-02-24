from slowapi import Limiter
from fastapi import Request

def get_real_ip(request: Request) -> str:
    """
    Extract the real client IP from the request headers, particularly useful
    when deployed behind proxies like Vercel.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
        
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
        
    if request.client and request.client.host:
        return request.client.host
        
    return "127.0.0.1"


# Default limit is broad here; we'll apply specific limits on heavy LLM routes.
limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute", "5000/hour"])

