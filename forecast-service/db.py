"""Supabase client for this service. Uses the SERVICE ROLE key (not the
publishable one used by the browser) - this is a trusted backend, so it
reads/writes through Row Level Security rather than being subject to it.
Never expose SUPABASE_SERVICE_ROLE_KEY to a browser or commit it to git."""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
