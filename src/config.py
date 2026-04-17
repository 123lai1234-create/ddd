# Configuration settings for the project

class Config:
    DATABASE_URL = "postgresql://user:password@localhost/dbname"
    SECRET_KEY = "your-secret-key"
    API_VERSION = "v1"

config = Config()