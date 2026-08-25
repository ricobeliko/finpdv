use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
#[repr(C)]
struct DocInfo1W {
    p_doc_name: *mut u16,
    p_output_file: *mut u16,
    p_datatype: *mut u16,
}

#[cfg(windows)]
extern "system" {
    fn LoadLibraryA(lp_lib_filename: *const u8) -> isize;
    fn GetProcAddress(h_module: isize, lp_proc_name: *const u8) -> *const std::ffi::c_void;
    fn FreeLibrary(h_lib_module: isize) -> i32;
}

#[cfg(windows)]
type OpenPrinterWFn = unsafe extern "system" fn(*mut u16, *mut isize, *mut std::ffi::c_void) -> i32;
#[cfg(windows)]
type StartDocPrinterWFn = unsafe extern "system" fn(isize, u32, *mut DocInfo1W) -> u32;
#[cfg(windows)]
type StartPagePrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type WritePrinterFn = unsafe extern "system" fn(isize, *const std::ffi::c_void, u32, *mut u32) -> i32;
#[cfg(windows)]
type EndPagePrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type EndDocPrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type ClosePrinterFn = unsafe extern "system" fn(isize) -> i32;

// 1. LISTA TODAS AS IMPRESSORAS INSTALADAS NO WINDOWS
#[tauri::command]
fn get_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Erro ao buscar impressoras: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = stdout
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(printers)
        } else {
            Err("Falha ao listar impressoras do Windows".into())
        }
    }
    #[cfg(not(windows))]
    {
        Ok(vec!["Impressora_Termica_Simulada".to_string()])
    }
}

// 2. ENVIA BYTES ESC/POS DIRETO PARA O SPOOLER (SEM CAIXA DE DIÁLOGO)
#[tauri::command]
fn print_raw_escpos(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        let spool = LoadLibraryA(b"winspool.drv\0".as_ptr());
        if spool == 0 {
            return Err("Não foi possível carregar winspool.drv".into());
        }

        let open_printer_ptr = GetProcAddress(spool, b"OpenPrinterW\0".as_ptr());
        let start_doc_ptr = GetProcAddress(spool, b"StartDocPrinterW\0".as_ptr());
        let start_page_ptr = GetProcAddress(spool, b"StartPagePrinter\0".as_ptr());
        let write_printer_ptr = GetProcAddress(spool, b"WritePrinter\0".as_ptr());
        let end_page_ptr = GetProcAddress(spool, b"EndPagePrinter\0".as_ptr());
        let end_doc_ptr = GetProcAddress(spool, b"EndDocPrinter\0".as_ptr());
        let close_printer_ptr = GetProcAddress(spool, b"ClosePrinter\0".as_ptr());

        if open_printer_ptr.is_null()
            || start_doc_ptr.is_null()
            || start_page_ptr.is_null()
            || write_printer_ptr.is_null()
            || end_page_ptr.is_null()
            || end_doc_ptr.is_null()
            || close_printer_ptr.is_null()
        {
            FreeLibrary(spool);
            return Err("Falha ao carregar funções de impressão do Windows".into());
        }

        let open_printer_w: OpenPrinterWFn = std::mem::transmute(open_printer_ptr);
        let start_doc_printer_w: StartDocPrinterWFn = std::mem::transmute(start_doc_ptr);
        let start_page_printer: StartPagePrinterFn = std::mem::transmute(start_page_ptr);
        let write_printer: WritePrinterFn = std::mem::transmute(write_printer_ptr);
        let end_page_printer: EndPagePrinterFn = std::mem::transmute(end_page_ptr);
        let end_doc_printer: EndDocPrinterFn = std::mem::transmute(end_doc_ptr);
        let close_printer: ClosePrinterFn = std::mem::transmute(close_printer_ptr);

        let mut name_wide: Vec<u16> = OsStr::new(&printer_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut handle: isize = 0;
        if open_printer_w(name_wide.as_mut_ptr(), &mut handle, std::ptr::null_mut()) == 0 {
            FreeLibrary(spool);
            return Err(format!("Impressora '{}' não foi encontrada no Windows", printer_name));
        }

        let mut doc_name: Vec<u16> = OsStr::new("Cupom PDV").encode_wide().chain(std::iter::once(0)).collect();
        let mut data_type: Vec<u16> = OsStr::new("RAW").encode_wide().chain(std::iter::once(0)).collect();

        let mut doc_info = DocInfo1W {
            p_doc_name: doc_name.as_mut_ptr(),
            p_output_file: std::ptr::null_mut(),
            p_datatype: data_type.as_mut_ptr(),
        };

        if start_doc_printer_w(handle, 1, &mut doc_info) == 0 {
            close_printer(handle);
            FreeLibrary(spool);
            return Err("Falha ao iniciar documento de impressão no spooler".into());
        }

        start_page_printer(handle);

        let mut written: u32 = 0;
        write_printer(
            handle,
            data.as_ptr() as *const std::ffi::c_void,
            data.len() as u32,
            &mut written,
        );

        end_page_printer(handle);
        end_doc_printer(handle);
        close_printer(handle);
        FreeLibrary(spool);

        Ok(())
    }

    #[cfg(not(windows))]
    {
        println!("Impressão RAW simulada: {} bytes", data.len());
        Ok(())
    }
}

mod sale_cancellation;
mod sale_transaction;

// 3. PULSO PARA ABRIR GAVETA DE DINHEIRO (RJ11)
#[tauri::command]
fn open_cash_drawer(printer_name: String) -> Result<(), String> {
    let drawer_pulse = vec![0x1B, 0x70, 0x00, 0x19, 0xFA];
    print_raw_escpos(printer_name, drawer_pulse)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_printers, 
            print_raw_escpos, 
            open_cash_drawer,
            sale_transaction::save_sale_transaction,
            sale_cancellation::cancel_sale_transaction
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar aplicação tauri");
}
