import type { ShotlogLabels } from "../client/types.js";
import type { EmailLabels } from "../server/email-types.js";
import type { SlackLabels } from "../server/slack-types.js";

// Brazilian Portuguese, addressing the Reporter as "você". Every interface is complete, so a
// new label fails the build until it's translated here.

const types: Readonly<Record<string, string>> = {
  Bug: "Bug",
  Question: "Dúvida",
  Idea: "Ideia",
};
const type = (value: string) =>
  Object.hasOwn(types, value) ? (types[value] ?? value) : value;

const detailKeys: Readonly<Record<string, string>> = {
  url: "URL",
  route: "Rota",
  title: "Título da página",
  referrer: "Página de origem",
  timeOnPageMs: "Tempo na página (ms)",
  userAgent: "User agent",
  browser: "Navegador",
  os: "Sistema operacional",
  deviceType: "Tipo de dispositivo",
  language: "Idioma",
  timezone: "Fuso horário",
  screen: "Tela",
  viewport: "Área visível",
  devicePixelRatio: "Densidade de pixels",
  colorScheme: "Esquema de cores",
  online: "Online",
  libraryVersion: "Versão da biblioteca",
  id: "ID",
  email: "E-mail",
  name: "Nome",
  level: "Nível",
  message: "Mensagem",
  stack: "Pilha",
  at: "Horário",
  method: "Método",
  status: "Status",
};

/**
 * Report Card and Annotation Editor text in Brazilian Portuguese.
 * @example
 * ```tsx
 * import * as ptBR from "shotlog/locales/pt-BR";
 * <ShotlogProvider endpoint="/api/support" labels={ptBR.labels} />
 * ```
 * @public
 */
export const labels: ShotlogLabels = {
  lang: "pt-BR",
  launcher: "Relatar um problema",
  title: "Enviar relato",
  close: "Fechar relato",
  type: "Tipo",
  bug: "Problema",
  question: "Dúvida",
  idea: "Ideia",
  description: "O que você estava tentando fazer?",
  descriptionRequired: "Descreva o que você estava tentando fazer.",
  screenshot: "Captura de tela",
  screenshotOptions: "Opções de captura de tela",
  capturePage: "Capturar página",
  captureScreen: "Capturar tela exata",
  captureDelayed: "Capturar em 5 segundos",
  countdown: (seconds) => `Capturando em ${seconds}…`,
  cancelCountdown: "Cancelar",
  slackChannel: "Canal do Slack",
  slackNoChannels: "Nenhum canal disponível",
  uploadImage: "Carregar imagem",
  screenshotPreview: "Captura de tela anexada",
  removeScreenshot: "Remover",
  capturingScreenshot: "Capturando a tela…",
  pageCaptureFailed:
    "Não foi possível capturar esta página. Tente Capturar tela exata ou Carregar imagem.",
  pageCaptureFailedWithoutScreen:
    "Não foi possível capturar esta página. Tente Carregar imagem.",
  screenCaptureFailed:
    "Não foi possível capturar sua tela. Tente Capturar página ou Carregar imagem.",
  imageFailed:
    "Não foi possível abrir esta imagem. Tente outra imagem ou Capturar página.",
  editScreenshot: "Editar",
  editorTitle: "Anotar captura de tela",
  editorCancel: "Cancelar",
  editorDone: "Concluir",
  editorSaving: "Salvando…",
  editorFailed: "Não foi possível salvar esta captura de tela. Tente de novo.",
  editorDiscardChanges: "Descartar suas anotações?",
  editorKeepEditing: "Continuar editando",
  editorDiscard: "Descartar",
  editorTextSmall: "Texto pequeno",
  editorTextMedium: "Texto médio",
  editorTextLarge: "Texto grande",
  editorTools: "Ferramentas de anotação",
  editorStyle: "Estilo da anotação",
  editorCanvas:
    "Área da captura de tela. Escolha uma ferramenta para desenhar; use Selecionar para mover as anotações.",
  editorSelect: "Selecionar / Mover",
  editorArrow: "Seta",
  editorRectangle: "Retângulo",
  editorOval: "Oval",
  editorText: "Texto",
  editorTextInput: "Texto da anotação",
  editorFreehand: "Mão livre",
  editorHighlighter: "Marca-texto",
  editorStep: "Contador de passos",
  editorSpotlight: "Destaque",
  editorRedact: "Pixelizar / Ocultar",
  editorCrop: "Cortar",
  editorApplyCrop: "Aplicar corte",
  editorCropHint:
    "Pressione Enter para aplicar o corte. Desfazer restaura o corte anterior.",
  editorRed: "Vermelho",
  editorYellow: "Amarelo",
  editorGreen: "Verde",
  editorBlue: "Azul",
  editorBlackWhite: "Preto / Branco (clique para alternar)",
  editorThin: "Fino",
  editorMedium: "Médio",
  editorThick: "Grosso",
  editorRounded: "Arredondado",
  editorSolid: "Sólido (mais forte)",
  editorUndo: "Desfazer (⌘/Ctrl+Z)",
  editorRedo: "Refazer (⇧⌘/Ctrl+Shift+Z)",
  editorToolSelected: (tool) => `Ferramenta ${tool} selecionada`,
  recordScreen: "Gravar tela",
  recordingLimit: (seconds) =>
    seconds % 60 ? `Até ${seconds} s` : `Até ${seconds / 60} min`,
  recording: "Gravação de tela",
  removeRecording: "Remover",
  recordingFailed: "Não foi possível gravar sua tela. Tente de novo.",
  recordingTooLarge: "Essa gravação ficou grande demais. Tente uma mais curta.",
  recordingTools: "Controles da gravação",
  recordingMove: "Mover barra de ferramentas",
  recordingElapsed: (time) => `Gravando, ${time}`,
  recordingPointer: "Usar a página",
  recordingPen: "Desenhar",
  recordingClear: "Limpar desenhos",
  recordingMute: "Desativar microfone",
  recordingUnmute: "Ativar microfone",
  recordingNoMicrophone: "Sem microfone",
  recordingFinish: "Concluir",
  recordingDiscard: "Descartar gravação",
  recordingConfirmDiscard: "Descartar?",
  uploadingRecording: (percent) => `Enviando gravação… ${percent}%`,
  includedDetails: (consoleCount, networkCount) =>
    `Detalhes incluídos · ${consoleCount} console · ${networkCount} rede`,
  detailsSummary: "Detalhes incluídos",
  consoleCount: (count) => `${count} console`,
  networkCount: (count) => `${count} rede`,
  environment: "Ambiente",
  reporter: "Autor",
  metadata: "Metadados",
  diagnosticTrail: "Trilha de diagnóstico",
  consoleEntries: "Erros e avisos do console",
  networkEntries: "Requisições de rede com falha",
  detailKey: (key) =>
    Object.hasOwn(detailKeys, key) ? (detailKeys[key] ?? key) : key,
  detailsEmpty: "Nenhum",
  detailsLoading: "Carregando detalhes…",
  detailsUnavailable:
    "Não foi possível coletar os detalhes. Feche e abra de novo para tentar outra vez.",
  diagnosticsDisabled: "A gravação está desativada.",
  detailsRefresh: "Estes detalhes são atualizados quando você envia.",
  submit: "Enviar",
  retry: "Tentar de novo",
  sending: "Enviando…",
  sentTitle: "Relato enviado",
  sent: (shortId) => `Referência ${shortId}`,
  resizeCard: "Redimensionar o cartão de relato",
  unauthorized: "Faça login e tente de novo.",
  forbidden: "Você não tem permissão para enviar um relato.",
  rateLimited: (minutes) =>
    `Você está enviando rápido demais. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
  payloadTooLarge:
    "Este relato está grande demais. Remova a captura de tela ou encurte a descrição e tente de novo.",
  validationFailed:
    "Não conseguimos processar este relato. Confira os detalhes e tente de novo.",
  deliveryFailed: "Não foi possível entregar seu relato. Tente de novo.",
  uploadFailed: "Não foi possível enviar sua captura de tela. Tente de novo.",
  recordingUploadFailed:
    "Não foi possível enviar sua gravação de tela. Tente de novo.",
  offline:
    "Você está sem conexão ou não foi possível conectar. Verifique sua conexão e tente de novo.",
  providerNotInstalled:
    "O envio de relatos ainda não está configurado. Tente mais tarde.",
  unsupportedRuntime: "O envio de relatos não está disponível neste navegador.",
};

/**
 * Support Log email text in Brazilian Portuguese, for teams that read reports in Portuguese.
 * @example
 * ```ts
 * import * as ptBR from "shotlog/locales/pt-BR";
 * import type { EmailConfig } from "shotlog/server";
 * const email = (config: EmailConfig): EmailConfig => ({ ...config, labels: ptBR.emailLabels });
 * ```
 * @public
 */
export const emailLabels: EmailLabels = {
  lang: "pt-BR",
  type,
  description: "Descrição",
  screenshot: "Captura de tela",
  recording: "Gravação de tela",
  watchRecording: "Assistir à gravação",
  reporter: "Autor",
  metadata: "Metadados",
  environment: "Ambiente",
  diagnosticTrail: "Trilha de diagnóstico",
  console: "Console",
  network: "Rede",
  none: "Nada informado",
  supportLogId: "ID do relato",
  createdAt: "Criado em",
  id: "ID",
  name: "Nome",
  email: "E-mail",
  time: "Horário",
  level: "Nível",
  message: "Mensagem",
  stack: "Pilha",
  method: "Método",
  status: "Status",
  url: "URL",
  route: "Rota",
  title: "Título da página",
  referrer: "Página de origem",
  timeOnPageMs: "Tempo na página (ms)",
  userAgent: "User agent",
  browser: "Navegador",
  os: "Sistema operacional",
  deviceType: "Tipo de dispositivo",
  language: "Idioma",
  timezone: "Fuso horário",
  screen: "Tela",
  viewport: "Área visível",
  devicePixelRatio: "Densidade de pixels",
  colorScheme: "Esquema de cores",
  online: "Online",
  libraryVersion: "Versão da biblioteca",
};

/**
 * Slack message text in Brazilian Portuguese. Slack calls threads "conversas" in Portuguese.
 * @example
 * ```ts
 * import * as ptBR from "shotlog/locales/pt-BR";
 * import type { SlackConfig } from "shotlog/server";
 * const slack: SlackConfig = { token: "xoxb-…", channel: "C0123456789", labels: ptBR.slackLabels };
 * ```
 * @public
 */
export const slackLabels: SlackLabels = {
  type,
  reporter: "Autor",
  page: "Página",
  browser: "Navegador",
  viewport: "Área visível",
  diagnosticTrail: "Trilha de diagnóstico",
  console: "console",
  network: "rede",
  failed: "falhou",
  screenshot: "Captura de tela",
  screenshotInThread: "Captura de tela na conversa",
  recording: "Gravação de tela",
};
