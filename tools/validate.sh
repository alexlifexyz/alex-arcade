#!/usr/bin/env bash
set -euo pipefail

mode="${1:---all}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
    echo "Usage: $0 [--all|--static|--firmware]" >&2
}

# Every tests/test_<name>.c is paired with main/<name>.c by convention, so a new
# game joins the gate as soon as its logic module and test file exist. Nothing
# here needs editing when a game is added; a test without its paired source is
# an error rather than a silently skipped check.
# Kept out of run_host_tests so the EXIT trap can still read it: a RETURN trap
# fires after the function's locals are gone, which trips `set -u`.
host_test_dir=""
cleanup_host_test_dir() {
    case "${host_test_dir}" in
        /tmp/ai-passport-host-tests.*) rm -rf -- "${host_test_dir}" ;;
    esac
}

run_host_tests() {
    local test_file stem source_file passed=0

    host_test_dir="$(mktemp -d /tmp/ai-passport-host-tests.XXXXXX)"
    trap cleanup_host_test_dir EXIT

    for test_file in tests/test_*.c; do
        stem="$(basename "${test_file}" .c)"
        source_file="main/${stem#test_}.c"
        if [[ ! -f "${source_file}" ]]; then
            echo "ERROR: ${test_file} has no paired source ${source_file}" >&2
            return 1
        fi
        # -lm covers the trigonometry several game models use; it is harmless
        # for the integer-only modules.
        "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
            "${test_file}" "${source_file}" -lm -o "${host_test_dir}/${stem}"
        "${host_test_dir}/${stem}"
        passed=$((passed + 1))
    done

    python3 tests/test_verify_firmware.py
    passed=$((passed + 1))

    echo "Host tests: PASS (${passed} suites)"
}

run_static_checks() {
    local actionlint_bin

    python3 tools/check_repo.py

    actionlint_bin="${ACTIONLINT_BIN:-}"
    if [[ -z "${actionlint_bin}" ]]; then
        actionlint_bin="$(command -v actionlint || true)"
    fi
    if [[ -z "${actionlint_bin}" || ! -x "${actionlint_bin}" ]]; then
        actionlint_bin="$(./tools/install-actionlint.sh)"
    fi
    "${actionlint_bin}" -color .github/workflows/*.yml

    run_host_tests
}

run_firmware_checks() (
    local validation_build_dir

    if ! command -v idf.py >/dev/null 2>&1; then
        echo "ERROR: idf.py is not available; activate ESP-IDF 5.5.3 first." >&2
        return 1
    fi

    validation_build_dir="$(mktemp -d /tmp/ai-passport-firmware.XXXXXX)"
    trap 'case "${validation_build_dir}" in /tmp/ai-passport-firmware.*) rm -rf -- "${validation_build_dir}" ;; esac' EXIT

    SDKCONFIG_DEFAULTS="${repo_root}/sdkconfig.defaults" \
        idf.py -B "${validation_build_dir}" \
        -D "SDKCONFIG=${validation_build_dir}/sdkconfig" build
    idf.py -B "${validation_build_dir}" merge-bin \
        -o "${validation_build_dir}/FoloToy-AI-Passport-full.bin"
    python3 tools/verify_firmware.py "${validation_build_dir}"
    mkdir -p "${repo_root}/build"
    install -m 0644 \
        "${validation_build_dir}/FoloToy-AI-Passport-full.bin" \
        "${repo_root}/build/FoloToy-AI-Passport-full.bin"
    echo "Firmware build: PASS"
)

cd "${repo_root}"
case "${mode}" in
    --all)
        run_static_checks
        run_firmware_checks
        ;;
    --static)
        run_static_checks
        ;;
    --firmware)
        run_firmware_checks
        ;;
    *)
        usage
        exit 2
        ;;
esac
