fn main() {
    // 更新源是编译期通过 option_env! 写进二进制的，改动后需要重新编译。
    println!("cargo:rerun-if-env-changed=KUKECHAT_UPDATE_METADATA_URL");
    tauri_build::build()
}
