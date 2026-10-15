#!/usr/bin/env bash
set -euo pipefail

mode="${1:---all}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
    echo "Usage: $0 [--all|--static|--firmware]" >&2
}

run_static_checks() {
    local actionlint_bin
    local test_dir

    python3 tools/check_repo.py

    actionlint_bin="${ACTIONLINT_BIN:-}"
    if [[ -z "${actionlint_bin}" ]]; then
        actionlint_bin="$(command -v actionlint || true)"
    fi
    if [[ -z "${actionlint_bin}" || ! -x "${actionlint_bin}" ]]; then
        actionlint_bin="$(./tools/install-actionlint.sh)"
    fi
    "${actionlint_bin}" -color .github/workflows/*.yml

    test_dir="$(mktemp -d /tmp/ai-passport-host-tests.XXXXXX)"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_ui_pixel_math.c main/ui_pixel_math.c \
        -o "${test_dir}/test_ui_pixel_math"
    "${test_dir}/test_ui_pixel_math"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_roulette_logic.c main/roulette_logic.c \
        -o "${test_dir}/test_roulette_logic"
    "${test_dir}/test_roulette_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_thunder_logic.c main/thunder_logic.c \
        -o "${test_dir}/test_thunder_logic"
    "${test_dir}/test_thunder_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_flysaber_logic.c main/flysaber_logic.c \
        -o "${test_dir}/test_flysaber_logic"
    "${test_dir}/test_flysaber_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_flydriver_logic.c main/flydriver_logic.c \
        -o "${test_dir}/test_flydriver_logic"
    "${test_dir}/test_flydriver_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_adventure_logic.c main/adventure_logic.c \
        -o "${test_dir}/test_adventure_logic"
    "${test_dir}/test_adventure_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_pong_logic.c main/pong_logic.c \
        -o "${test_dir}/test_pong_logic"
    "${test_dir}/test_pong_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_contra_logic.c main/contra_logic.c \
        -o "${test_dir}/test_contra_logic"
    "${test_dir}/test_contra_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_flappy_logic.c main/flappy_logic.c \
        -o "${test_dir}/test_flappy_logic"
    "${test_dir}/test_flappy_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_worldtime_logic.c main/worldtime_logic.c \
        -o "${test_dir}/test_worldtime_logic"
    "${test_dir}/test_worldtime_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_sparkler_logic.c main/sparkler_logic.c \
        -o "${test_dir}/test_sparkler_logic"
    "${test_dir}/test_sparkler_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_thunderracer_logic.c main/thunderracer_logic.c \
        -o "${test_dir}/test_thunderracer_logic"
    "${test_dir}/test_thunderracer_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_battlecity_logic.c main/battlecity_logic.c \
        -o "${test_dir}/test_battlecity_logic"
    "${test_dir}/test_battlecity_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_pacman_logic.c main/pacman_logic.c \
        -o "${test_dir}/test_pacman_logic"
    "${test_dir}/test_pacman_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_fish_logic.c main/fish_logic.c \
        -o "${test_dir}/test_fish_logic"
    "${test_dir}/test_fish_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_match3_logic.c main/match3_logic.c \
        -o "${test_dir}/test_match3_logic"
    "${test_dir}/test_match3_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_geartrooper_logic.c main/geartrooper_logic.c \
        -o "${test_dir}/test_geartrooper_logic"
    "${test_dir}/test_geartrooper_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_cyber_runner_logic.c main/cyber_runner_logic.c \
        -o "${test_dir}/test_cyber_runner_logic"
    "${test_dir}/test_cyber_runner_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_pawssprint_logic.c main/pawssprint_logic.c \
        -lm -o "${test_dir}/test_pawssprint_logic"
    "${test_dir}/test_pawssprint_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_smash_logic.c main/smash_logic.c \
        -lm -o "${test_dir}/test_smash_logic"
    "${test_dir}/test_smash_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_bubble_logic.c main/bubble_logic.c \
        -lm -o "${test_dir}/test_bubble_logic"
    "${test_dir}/test_bubble_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_wind_logic.c main/wind_logic.c \
        -lm -o "${test_dir}/test_wind_logic"
    "${test_dir}/test_wind_logic"
    "${CC:-cc}" -std=c11 -Wall -Wextra -Werror -Imain \
        tests/test_wave_logic.c main/wave_logic.c \
        -lm -o "${test_dir}/test_wave_logic"
    "${test_dir}/test_wave_logic"
    python3 tests/test_verify_firmware.py
    rm -rf "${test_dir}"
    echo "Host tests: PASS"
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
