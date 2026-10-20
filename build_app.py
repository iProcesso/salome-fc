# -*- coding: utf-8 -*-
"""
build_app.py — gera app.html (versão OFICIAL) a partir de index.html (protótipo).

Desde a v10.0 o index já faz tudo que o app oficial precisa: entra pela sessão,
lê e grava no servidor (google.script.run dentro do Apps Script, fetch fora dele) e
não tem dados fictícios — a base de teste só existe quando o botão PROTÓTIPO é usado.

Então este script faz só o que separa o oficial do protótipo:
  1. tira o botão PROTÓTIPO da barra superior
  2. põe o título oficial
  3. avisa se sobrou qualquer referência ao modo protótipo que deveria sair
"""
import re, sys

src = open('index.html', encoding='utf-8').read()
s = src

# 1. botão PROTÓTIPO não existe no app oficial
s, n_btn = re.subn(r'<button class="btn sm" onclick="protoEntrar\(\)"[^>]*>PROTÓTIPO</button>\s*', '', s)

# 2. título oficial
s = s.replace('<title>FC Salomé · Protótipo</title>', '<title>FC Salomé</title>')

# 3. checagem: nada de protótipo deve ficar visível no oficial
avisos = []
if 'onclick="protoEntrar()"' in s:
    avisos.append('ainda há botão de protótipo')
if '>PROTÓTIPO<' in s:
    avisos.append('ainda há o rótulo PROTÓTIPO em algum botão')

open('app.html', 'w', encoding='utf-8').write(s)
print('app.html gerado — %.0f KB; botões de protótipo removidos: %d' % (len(s)/1024, n_btn))
for a in avisos:
    print('AVISO:', a)
sys.exit(1 if avisos else 0)
