#!/usr/bin/env python3
import http.server
import socketserver
import os

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Si accès à la racine "/", servir "index.html"
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8002
with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"✓ Serveur HTTP lancé sur http://127.0.0.1:{PORT}")
    print(f"✓ Dossier servi: {os.getcwd()}")
    httpd.serve_forever()
