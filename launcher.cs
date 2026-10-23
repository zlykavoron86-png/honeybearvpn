using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class Program {
    [STAThread]
    static void Main(string[] args) {
        try {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string targetExe = Path.Combine(baseDir, "dist", "win-unpacked", "HoneyBearVPN.exe");
            
            if (!File.Exists(targetExe)) {
                MessageBox.Show("Исполняемый файл не найден:\n" + targetExe, "HoneyBearVPN Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = targetExe;
            startInfo.WorkingDirectory = Path.GetDirectoryName(targetExe);
            startInfo.UseShellExecute = true;
            startInfo.Verb = "runas";

            Process.Start(startInfo);
        } catch (Exception ex) {
            // User cancelled UAC prompt or error
            if (!ex.Message.ToLower().Contains("cancel") && !ex.Message.ToLower().Contains("отмен")) {
                MessageBox.Show("Для работы Discord Voice и TUN адаптера требуются права администратора:\n" + ex.Message, "HoneyBearVPN", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
