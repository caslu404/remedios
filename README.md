# Tratamento do Lucas

PWA estática para acompanhar diariamente o protocolo medicamentoso, com desbloqueio sequencial dos dias, funcionamento offline e backup em JSON.

## Funcionalidades

- O próximo dia é liberado somente quando todas as doses do dia anterior forem marcadas.
- A primeira dose define automaticamente a data do Dia 1.
- Datas futuras são calculadas a partir do início.
- Dados persistidos localmente no navegador.
- Exportação e importação de backup em JSON.
- Instalação na Tela de Início do iPhone.
- Funcionamento offline após a primeira visita.

## Deploy na Vercel

1. Suba estes arquivos para a branch `main` de um repositório GitHub.
2. Na Vercel, clique em **Add New > Project** e importe o repositório.
3. Selecione **Framework Preset: Other**.
4. Não configure Build Command nem Output Directory.
5. Faça o deploy.

## Dados e backup

Os dados ficam no `localStorage` do navegador. Trocar de aparelho, apagar os dados do Safari ou usar outro navegador não transfere o histórico. Use o botão **Exportar backup** periodicamente.

## iPhone

Abra a URL no Safari, toque em **Compartilhar** e selecione **Adicionar à Tela de Início**. Para notificações de horários, use o recurso Medicamentos do app Saúde.

## Observação

O app apenas organiza a prescrição recebida. Em caso de divergência, prevalecem a receita e a orientação médica.
