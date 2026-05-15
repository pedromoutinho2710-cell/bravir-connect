import { QRCodeSVG } from "qrcode.react";

const EVENTO_URL = "https://bravir-connect.vercel.app/evento";
const GREEN = "#1a6b3a";

export default function EventoQR() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-4 shadow-sm" style={{ backgroundColor: GREEN }}>
        <span className="text-white font-bold text-2xl tracking-widest">BRAVIR</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="flex flex-col items-center gap-4">
          <div className="p-5 rounded-2xl border-2 border-gray-100 shadow-sm bg-white">
            <QRCodeSVG
              value={EVENTO_URL}
              size={180}
              fgColor="#111111"
              bgColor="#ffffff"
              level="M"
            />
          </div>

          <p className="text-sm text-gray-500 text-center">
            Aponte a câmera do celular para acessar o formulário
          </p>

          <span
            className="text-sm font-semibold tracking-tight px-3 py-1 rounded-full bg-green-50"
            style={{ color: GREEN }}
          >
            {EVENTO_URL.replace("https://", "")}
          </span>
        </div>
      </main>
    </div>
  );
}
