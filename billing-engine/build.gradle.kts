plugins {
    kotlin("multiplatform")
}

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(21)

    jvm()

    // The browser calculator imports this library as an ES module (see web/).
    js {
        moduleName = "billing-engine"
        nodejs()
        useEsModules()
        binaries.library()
        generateTypeScriptDefinitions()
    }

    sourceSets {
        commonMain.dependencies {
            // java.math.BigDecimal and java.time are JVM-only; these work on JVM and JS.
            api("com.ionspin.kotlin:bignum:0.3.10")
            api("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
