# db.py
import os
import pymssql

def get_connection(*, autocommit: bool = False):
    return pymssql.connect(
        server=os.getenv("AZURE_SERVER"),
        user=os.getenv("AZURE_USERNAME"),
        password=os.getenv("AZURE_PASSWORD"),
        database=os.getenv("AZURE_DATABASE"),
        autocommit=autocommit,
    )