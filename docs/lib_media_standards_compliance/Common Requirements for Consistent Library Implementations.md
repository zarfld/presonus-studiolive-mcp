Common Requirements for Consistent Library Implementations

To ensure all hardware-agnostic/platform-agnostic libraries remain consistent and easy to integrate, they must adhere to the following common requirements:

1. Code Standards and Build System

Unified C++ Standard: All libraries must target the same C++ language version (e.g. C++17 or C++20) and follow a common coding style guide (naming conventions, formatting, and use of standard fixed-width types for portability).

Modular, Single-Responsibility Design: Library code should be organized into cohesive classes/modules with a single responsibility. Cross-library naming schemes and project structures should be similar to facilitate easy navigation and understanding.

Consistent Build System: Use the same build system (e.g. CMake) across all libraries. The build process must be automated and reproducible on any platform, ensuring each library can be compiled in the same manner.

Dependency Management: Dependencies should be handled uniformly. If the approach is self-contained (header-only or vendored) or using a package manager (like Conan or vcpkg), all libraries must use the same strategy to avoid integration conflicts.

Version Control and CI: Each library should integrate with a Continuous Integration pipeline to automatically build and run tests on every change. This ensures that all libraries maintain build stability and catch integration issues early.

2. Hardware Abstraction Layer (HAL) Consistency

Platform-Agnostic Core: No platform-specific or OS-specific code is allowed in the core library implementation. All direct hardware or OS interactions must be routed through a well-defined Hardware Abstraction Layer (HAL).

Unified HAL Interface Style: All libraries should use the same HAL interface pattern (e.g. if using C-style function pointers for callbacks vs. C++ virtual interfaces, choose one and apply it consistently across libraries). This makes it easier to provide platform-specific implementations in a uniform way.

Separation of Concerns: Follow a layered architecture – the protocol/logic layer calls abstract HAL interfaces, and the actual hardware-specific code resides in separate modules or plugins. This ensures that swapping out or modifying hardware-specific code does not require changes in the core logic.

Consistent Error Handling: Use the same error reporting mechanism across HAL interfaces (e.g. always use return codes or always use exceptions, but not a mix). A uniform approach (such as returning standardized error codes) makes error handling predictable when integrating multiple libraries.

No Direct Hardware Calls: Libraries should never directly call hardware or OS functions; instead, they must go through the HAL. This guarantees that the core libraries remain platform-neutral and easily portable to different operating systems or microcontrollers.

3. Testing and Quality Assurance

Test-Driven Development (TDD): New features or modules in any library should be developed with tests written first. This practice ensures high coverage and influences a more modular, testable design.

Uniform Test Framework: All libraries must use the same testing framework (e.g. Google Test for unit tests, possibly supplemented by Unity for embedded tests). This provides consistency in how tests are written and executed across projects.

Comprehensive Unit Testing: Every library requires a thorough suite of unit tests covering its public API and critical internal logic. Tests should be automated, and achieving 100% pass rate on the test suite is required before any release or integration.

Continuous Integration & Regression Testing: Each library should be part of a CI system that runs the full test suite on each commit/merge. This ensures that changes in one library do not break its functionality and that all libraries remain stable together when used as submodules.

Standards Conformance Testing: Where applicable (e.g., for IEEE/AES standard implementations), provide tests or example scenarios to verify conformance to the relevant standard specification. This might include cross-vendor interoperability tests or formal test vectors provided by the standard.

4. Design, Compatibility, and Usage

Uniform API Design: Design library APIs with a consistent style and philosophy. For example, if one library uses a particular naming convention or initialization pattern, others should follow suit. This uniformity means that a developer who uses one library can quickly learn and use the others.

Backward Compatibility: As libraries evolve, their public interfaces should, as much as possible, remain backward compatible. If changes are needed, use deprecation strategies (marking features as obsolete before removal) to give users time to adapt across versions.

Interoperability and Integration: The libraries are intended to work together (often as submodules of a larger project), so they must not duplicate conflicting functionality or define contradictory interfaces. Data types and structures used for common concepts (e.g., timestamps, network frame formats) should be standardized across libraries.

Configuration and Optional Features: Handle optional features in a consistent way (preferably at compile-time via configuration macros or build options for zero runtime overhead, if that is the chosen strategy). All libraries should either uniformly use compile-time flags or runtime configuration for optional features, but not mix both approaches arbitrarily.

Performance and Real-Time Behavior: All code should be written with real-time constraints in mind. This means:

Avoiding dynamic memory allocation and long blocking calls in time-critical paths.

Prioritizing low jitter and deterministic execution over latency or throughput when making design decisions (since consistent timing is often crucial in audio/telecom domains).

Providing hooks or configurations for performance profiling (e.g., instrumentation that can be toggled for profiling tools like SystemView) in a similar manner across libraries.

Documentation and Examples: Each library must include clear documentation and usage examples following a common format. This may include a standard README layout, consistent commenting style in code, and possibly auto-generated reference docs so that users find a similar level of guidance for each component.

By enforcing these common requirements, the libraries will remain consistent in style, usage, and quality. This makes them easier to maintain collectively, integrate into projects, and adopt by users or companies looking for reliable, standardized implementations.